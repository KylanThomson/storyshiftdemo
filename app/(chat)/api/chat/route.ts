import { auth, type UserType } from '@/app/(auth)/auth';
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  saveChat,
  saveMessages,
} from '@/lib/db/queries';
import { generateUUID } from '@/lib/utils';
import { generateTitleFromUserMessage } from '../../actions';
import { entitlementsByUserType } from '@/lib/ai/entitlements';
import { postRequestBodySchema, type PostRequestBody } from './schema';
import { ChatSDKError } from '@/lib/errors';
import type { ChatMessage } from '@/lib/types';
import type { VisibilityType } from '@/components/visibility-selector';
import type { BrandId } from '@/lib/brands';
import { callStructuredGraphRAG, callFastGraphRAG, brandIdToTenant } from '@/lib/graphrag/api';
import { createUIMessageStream, JsonToSseTransformStream } from 'ai';
import {
  createResumableStreamContext,
  type ResumableStreamContext,
} from 'resumable-stream';
import { after } from 'next/server';

export const maxDuration = 300;

let globalStreamContext: ResumableStreamContext | null = null;

export function getStreamContext() {
  if (!globalStreamContext) {
    try {
      globalStreamContext = createResumableStreamContext({
        waitUntil: after,
      });
    } catch (error: any) {
      if (error.message?.includes('REDIS_URL')) {
        console.log(
          ' > Resumable streams are disabled due to missing REDIS_URL',
        );
      } else {
        console.error(error);
      }
    }
  }

  return globalStreamContext;
}

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (_) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  try {
    const {
      id,
      message,
      selectedVisibilityType,
      selectedBrandId,
    }: {
      id: string;
      message: ChatMessage;
      selectedVisibilityType: VisibilityType;
      selectedBrandId?: BrandId;
    } = requestBody;

    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError('unauthorized:chat').toResponse();
    }

    const userType: UserType = session.user.type;

    const messageCount = await getMessageCountByUserId({
      id: session.user.id,
      differenceInHours: 24,
    });

    if (messageCount > entitlementsByUserType[userType].maxMessagesPerDay) {
      return new ChatSDKError('rate_limit:chat').toResponse();
    }

    const chat = await getChatById({ id });

    if (!chat) {
      const title = await generateTitleFromUserMessage({
        message,
      });

      await saveChat({
        id,
        userId: session.user.id,
        title,
        visibility: selectedVisibilityType,
      });
    } else {
      if (chat.userId !== session.user.id) {
        return new ChatSDKError('forbidden:chat').toResponse();
      }
    }

    // Persist the user's message
    await saveMessages({
      messages: [
        {
          chatId: id,
          id: message.id,
          role: 'user',
          parts: message.parts,
          attachments: [],
          createdAt: new Date(),
        },
      ],
    });

    // Create a stream id (kept for UI compatibility even though we're returning JSON)
    const streamId = generateUUID();
    await createStreamId({ streamId, chatId: id });

    // Route chats through Structured GraphRAG API with fallback to legacy
    try {
      const company = brandIdToTenant(selectedBrandId);
      const userQuestion =
        message.parts
          .filter((part) => part.type === 'text')
          .map((part) => part.text)
          .join(' ')
          .trim() || '';

      const responseId = generateUUID();
      let textBody = '';
      let useStructuredFormat = false;

      try {
        // Try the new structured GraphRAG API first
        const structuredResponse = await callStructuredGraphRAG(
          company,
          userQuestion,
          process.env.STRUCTURED_GRAPHRAG_DATABASE || 'neo4j',
        );

        // Format the structured response as JSON for the frontend to parse
        textBody = JSON.stringify(structuredResponse, null, 2);
        useStructuredFormat = true;

        console.log('✅ Successfully used structured GraphRAG API');
      } catch (structuredError) {
        console.warn('⚠️ Structured GraphRAG API failed, falling back to legacy:', structuredError);

        // Fallback to legacy Fast GraphRAG API
        const legacyResponse = await callFastGraphRAG(
          company,
          userQuestion,
          process.env.FAST_GRAPHRAG_DATABASE || 'neo4j',
        );

        textBody =
          legacyResponse.answer ??
          "I don't have enough information in the Graph Facts to answer that.";

        if (legacyResponse.factsPreview?.length) {
          textBody +=
            '\n\n**Retrieved Facts:**\n' +
            legacyResponse.factsPreview.slice(0, 10).map((f: string) => `• ${f}`).join('\n');
        }

        if (legacyResponse.sources?.length) {
          textBody +=
            '\n\n**Sources:**\n' +
            legacyResponse.sources
              .map((s: { id: number; url: string }) => `[${s.id}] ${s.url}`)
              .join('\n');
        }

        console.log('✅ Successfully used legacy GraphRAG API');
      }

      const graphRAGMessage = {
        id: responseId,
        role: 'assistant' as const,
        parts: [{ type: 'text' as const, text: textBody }],
        createdAt: new Date(),
        attachments: [],
        chatId: id,
      };

      await saveMessages({ messages: [graphRAGMessage] });

      // Return the complete message as JSON since GraphRAG doesn't stream
      return Response.json({
        id: responseId,
        role: 'assistant',
        content: textBody,
        createdAt: new Date().toISOString(),
        isStructured: useStructuredFormat,
      }, { status: 200 });
    } catch (error) {
      console.error('❌ Both GraphRAG APIs failed:', error);
      return new ChatSDKError('offline:chat').toResponse();
    }
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    return new ChatSDKError('bad_request:api').toResponse();
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:chat').toResponse();
  }

  const chat = await getChatById({ id });

  if (chat.userId !== session.user.id) {
    return new ChatSDKError('forbidden:chat').toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}

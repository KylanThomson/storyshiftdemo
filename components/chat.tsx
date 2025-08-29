'use client';

import { useEffect, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { ChatHeader } from '@/components/chat-header';
import type { Vote } from '@/lib/db/schema';
import { fetcher, fetchWithErrorHandlers, generateUUID } from '@/lib/utils';
import { Artifact } from './artifact';
import { MultimodalInput } from './multimodal-input';
import { Messages } from './messages';
import type { VisibilityType } from './visibility-selector';
import { useArtifactSelector } from '@/hooks/use-artifact';
import { unstable_serialize } from 'swr/infinite';
import { getChatHistoryPaginationKey } from './sidebar-history';
import { toast } from './toast';
import type { Session } from 'next-auth';
import { useSearchParams } from 'next/navigation';
import { useChatVisibility } from '@/hooks/use-chat-visibility';
import { ChatSDKError } from '@/lib/errors';
import type { Attachment, ChatMessage } from '@/lib/types';
import { useDataStream } from './data-stream-provider';
import { useBranding } from './branding-provider';
import { useArtifact, initialArtifactData } from '@/hooks/use-artifact';

type ChatStatus = 'ready' | 'submitted' | 'streaming';

export function Chat({
  id,
  initialMessages,
  initialVisibilityType,
  isReadonly,
  session,
  autoResume,
}: {
  id: string;
  initialMessages: ChatMessage[];
  initialVisibilityType: VisibilityType;
  isReadonly: boolean;
  session: Session;
  autoResume: boolean;
}) {
  const { visibilityType } = useChatVisibility({
    chatId: id,
    initialVisibilityType,
  });

  const { mutate } = useSWRConfig();
  const { setDataStream } = useDataStream();
  const { brandId } = useBranding();
  const { setArtifact } = useArtifact();

  const [input, setInput] = useState<string>('');

  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [status, setStatus] = useState<ChatStatus>('ready');
  const [dynamicSuggestedActions, setDynamicSuggestedActions] = useState<Array<{ action: string; description: string }>>([]);

  const sendMessage = async (message: any) => {
    setStatus('submitted');

    // Add user message to UI immediately
    const userMessage: ChatMessage = {
      id: generateUUID(),
      role: 'user',
      parts: message.parts || [{ type: 'text', text: message.text || '' }],
    };

    setMessages(prev => [...prev, userMessage]);
    setStatus('streaming');

    // Add a temporary loading message
    const loadingMessageId = generateUUID();
    const loadingMessage: ChatMessage = {
      id: loadingMessageId,
      role: 'assistant',
      parts: [{ type: 'text', text: 'Thinking...' }],
    };

    setMessages(prev => [...prev, loadingMessage]);

    try {
      const response = await fetchWithErrorHandlers('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          message: userMessage,
          selectedVisibilityType: visibilityType,
          selectedBrandId: brandId,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const assistantResponse = await response.json();

      // Extract suggested actions from structured response if available
      if (assistantResponse.isStructured) {
        try {
          const structuredData = JSON.parse(assistantResponse.content);
          if (structuredData.structured_response?.Suggested_Actions) {
            setDynamicSuggestedActions(structuredData.structured_response.Suggested_Actions);
          }
        } catch (error) {
          console.warn('Failed to parse structured response for suggested actions:', error);
        }
      }

      // Replace loading message with actual response
      setMessages(prev => {
        const filtered = prev.filter(msg => msg.id !== loadingMessageId);
        const assistantMessage: ChatMessage = {
          id: assistantResponse.id,
          role: 'assistant',
          parts: [{ type: 'text', text: assistantResponse.content }],
        };
        return [...filtered, assistantMessage];
      });

      mutate(unstable_serialize(getChatHistoryPaginationKey));
    } catch (error) {
      console.error('Chat error:', error);

      // Remove loading message on error
      setMessages(prev => prev.filter(msg => msg.id !== loadingMessageId));

      toast({
        type: 'error',
        description: 'Failed to send message. Please try again.',
      });
    } finally {
      setStatus('ready');
    }
  };

  const stop = async () => {
    setStatus('ready');
  };

  const regenerate = async () => {
    // Re-run the assistant response for the latest user message (used after edits)
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');

    if (!lastUserMessage) return;

    setStatus('submitted');
    setStatus('streaming');

    // Add a temporary loading message
    const loadingMessageId = generateUUID();
    const loadingMessage: ChatMessage = {
      id: loadingMessageId,
      role: 'assistant',
      parts: [{ type: 'text', text: 'Thinking...' }],
    };

    setMessages((prev) => [...prev, loadingMessage]);

    try {
      const response = await fetchWithErrorHandlers('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          message: lastUserMessage,
          selectedVisibilityType: visibilityType,
          selectedBrandId: brandId,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const assistantResponse = await response.json();

      // Replace loading message with actual response
      setMessages((prev) => {
        const filtered = prev.filter((msg) => msg.id !== loadingMessageId);
        const assistantMessage: ChatMessage = {
          id: assistantResponse.id,
          role: 'assistant',
          parts: [{ type: 'text', text: assistantResponse.content }],
        };
        return [...filtered, assistantMessage];
      });

      mutate(unstable_serialize(getChatHistoryPaginationKey));
    } catch (error) {
      console.error('Regenerate error:', error);

      // Remove loading message on error
      setMessages((prev) => prev.filter((msg) => msg.id !== loadingMessageId));

      toast({
        type: 'error',
        description: 'Failed to regenerate. Please try again.',
      });
    } finally {
      setStatus('ready');
    }
  };

  const searchParams = useSearchParams();
  const query = searchParams.get('query');

  const [hasAppendedQuery, setHasAppendedQuery] = useState(false);

  useEffect(() => {
    if (query && !hasAppendedQuery) {
      sendMessage({
        role: 'user' as const,
        parts: [{ type: 'text', text: query }],
      });

      setHasAppendedQuery(true);
      window.history.replaceState({}, '', `/chat/${id}`);
    }
  }, [query, sendMessage, hasAppendedQuery, id]);

  const { data: votes } = useSWR<Array<Vote>>(
    messages.length >= 2 ? `/api/vote?chatId=${id}` : null,
    fetcher,
  );

  const [attachments, setAttachments] = useState<Array<Attachment>>([]);
  const isArtifactVisible = useArtifactSelector((state) => state.isVisible);

  // Reset any lingering per-session state when starting a new chat (or switching ids)
  useEffect(() => {
    // Clear streaming deltas so the new chat doesn't process prior stream parts
    setDataStream([]);
    // Reset artifact panel so no prior document/overlay appears in a fresh chat
    setArtifact(initialArtifactData);
  }, [id, setDataStream, setArtifact]);

  return (
    <>
      <div className="flex flex-col min-w-0 h-dvh bg-background">
        <ChatHeader
          chatId={id}
          selectedVisibilityType={initialVisibilityType}
          isReadonly={isReadonly}
          session={session}
        />

        <Messages
          chatId={id}
          status={status}
          votes={votes}
          messages={messages}
          setMessages={setMessages}
          regenerate={regenerate}
          isReadonly={isReadonly}
          isArtifactVisible={isArtifactVisible}
        />

        <form
          className="flex mx-auto px-4 bg-background pb-4 md:pb-6 gap-2 w-full md:max-w-3xl"
          onSubmit={(e) => {
            // Prevent native form submission from clearing the textarea or navigating
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          {!isReadonly && (
            <MultimodalInput
              chatId={id}
              input={input}
              setInput={setInput}
              status={status}
              stop={stop}
              attachments={attachments}
              setAttachments={setAttachments}
              messages={messages}
              setMessages={setMessages}
              sendMessage={sendMessage}
              selectedVisibilityType={visibilityType}
              dynamicSuggestedActions={dynamicSuggestedActions}
            />
          )}
        </form>
      </div>

      <Artifact
        chatId={id}
        input={input}
        setInput={setInput}
        status={status}
        stop={stop}
        attachments={attachments}
        setAttachments={setAttachments}
        sendMessage={sendMessage}
        messages={messages}
        setMessages={setMessages}
        regenerate={regenerate}
        votes={votes}
        isReadonly={isReadonly}
        selectedVisibilityType={visibilityType}
      />
    </>
  );
}

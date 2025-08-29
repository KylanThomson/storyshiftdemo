'use client';
import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';
import { memo, useState } from 'react';
import type { Vote } from '@/lib/db/schema';
import { DocumentToolCall, DocumentToolResult } from './document';
import { PencilEditIcon, SparklesIcon } from './icons';
import { Markdown } from './markdown';
import { MessageActions } from './message-actions';
import { PreviewAttachment } from './preview-attachment';
import { Weather } from './weather';
import equal from 'fast-deep-equal';
import { cn, sanitizeText } from '@/lib/utils';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { MessageEditor } from './message-editor';
import { DocumentPreview } from './document-preview';
import { MessageReasoning } from './message-reasoning';
import type { UseChatHelpers } from '@ai-sdk/react';
import type { ChatMessage } from '@/lib/types';
import { useDataStream } from './data-stream-provider';
import { parseRetrievedFacts } from '@/lib/graphrag/parse-retrieved-facts';
import { KnowledgeGraphViewer } from './knowledge-graph';
import { StructuredResponseComponent } from './structured-response';
import type { StructuredGraphRAGResponse } from '@/lib/graphrag/api';
import {
  parseStructuredGraphRAGResponse,
  parseLegacyGraphRAGResponse,
  hasKnowledgeGraphData,
  hasDebugInfo,
  type StructuredParsedResponse
} from '@/lib/graphrag/parse-structured-response';

// Type narrowing is handled by TypeScript's control flow analysis
// The AI SDK provides proper discriminated unions for tool calls

const PurePreviewMessage = ({
  chatId,
  message,
  vote,
  isLoading,
  setMessages,
  regenerate,
  isReadonly,
  requiresScrollPadding,
}: {
  chatId: string;
  message: ChatMessage;
  vote: Vote | undefined;
  isLoading: boolean;
  setMessages: UseChatHelpers<ChatMessage>['setMessages'];
  regenerate: UseChatHelpers<ChatMessage>['regenerate'];
  isReadonly: boolean;
  requiresScrollPadding: boolean;
}) => {
  const [mode, setMode] = useState<'view' | 'edit'>('view');

  const attachmentsFromMessage = message.parts.filter(
    (part) => part.type === 'file',
  );

  useDataStream();

  // Helper function to detect if text contains structured response data
  const detectStructuredResponse = (text: string): StructuredGraphRAGResponse | null => {
    try {
      // Look for JSON-like structured response in the text
      const jsonMatch = text.match(/\{[\s\S]*"structured_response"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.structured_response && parsed.tenant && parsed.question) {
          return parsed as StructuredGraphRAGResponse;
        }
      }
      return null;
    } catch {
      return null;
    }
  };

  // Helper function to handle suggested action clicks
  const handleSuggestedActionClick = (action: string) => {
    // You can implement this to send the action as a new message
    // For now, we'll just log it
    console.log('Suggested action clicked:', action);
    // TODO: Integrate with chat system to send new message
  };

  return (
    <AnimatePresence>
      <motion.div
        data-testid={`message-${message.role}`}
        className="w-full mx-auto max-w-3xl px-4 group/message"
        initial={{ y: 5, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        data-role={message.role}
      >
        <div
          className={cn(
            'flex gap-4 w-full group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl',
            {
              'w-full': mode === 'edit',
              'group-data-[role=user]/message:w-fit': mode !== 'edit',
            },
          )}
        >
          {message.role === 'assistant' && (
            <div className="size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border bg-background">
              <div className="translate-y-px">
                <SparklesIcon size={14} />
              </div>
            </div>
          )}

          <div
            className={cn('flex flex-col gap-4 w-full', {
              'min-h-96': message.role === 'assistant' && requiresScrollPadding,
            })}
          >
            {attachmentsFromMessage.length > 0 && (
              <div
                data-testid={`message-attachments`}
                className="flex flex-row justify-end gap-2"
              >
                {attachmentsFromMessage.map((attachment) => (
                  <PreviewAttachment
                    key={attachment.url}
                    attachment={{
                      name: attachment.filename ?? 'file',
                      contentType: attachment.mediaType,
                      url: attachment.url,
                    }}
                  />
                ))}
              </div>
            )}

            {message.parts?.map((part, index) => {
              const { type } = part;
              const key = `message-${message.id}-part-${index}`;

              if (type === 'reasoning' && part.text?.trim().length > 0) {
                return (
                  <MessageReasoning
                    key={key}
                    isLoading={isLoading}
                    reasoning={part.text}
                  />
                );
              }

              if (type === 'text') {
                if (mode === 'view') {
                  // First, try to detect if this is a structured response
                  const structuredResponse = message.role === 'assistant' ? detectStructuredResponse(part.text ?? '') : null;

                  let parsedData: StructuredParsedResponse | null = null;

                  if (structuredResponse) {
                    // Handle structured response
                    parsedData = parseStructuredGraphRAGResponse(
                      structuredResponse.structured_response,
                      structuredResponse.sources,
                      structuredResponse.factsPreview
                    );
                  } else if (message.role === 'assistant') {
                    // Fallback to legacy parsing for backward compatibility
                    const legacyParsed = parseRetrievedFacts(part.text ?? '');
                    if (legacyParsed) {
                      parsedData = parseLegacyGraphRAGResponse(
                        legacyParsed.cleanText,
                        [], // No sources in legacy format
                        []  // No factsPreview in legacy format
                      );
                      // Copy over the legacy parsed data
                      parsedData.nodes = legacyParsed.nodes;
                      parsedData.edges = legacyParsed.edges;
                      parsedData.types = legacyParsed.types;
                      parsedData.sourceIndexToUrl = legacyParsed.sourceIndexToUrl;
                      parsedData.preamble = legacyParsed.preamble;
                    }
                  }

                  const displayText = parsedData?.chatResponse || (part.text ?? '');
                  const hasKG = parsedData ? hasKnowledgeGraphData(parsedData) : false;
                  const hasDebugData = parsedData ? hasDebugInfo(parsedData) : false;

                  return (
                    <div key={key} className="flex flex-row gap-2 items-start">
                      {message.role === 'user' && !isReadonly && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              data-testid="message-edit-button"
                              variant="ghost"
                              className="px-2 h-fit rounded-full text-muted-foreground opacity-0 group-hover/message:opacity-100"
                              onClick={() => {
                                setMode('edit');
                              }}
                            >
                              <PencilEditIcon />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Edit message</TooltipContent>
                        </Tooltip>
                      )}

                      <div
                        data-testid="message-content"
                        className={cn(
                          'flex flex-col gap-4 px-3 py-2 rounded-2xl text-foreground glass-chat brand-surface brand-border-accent',
                          {
                            'neon-border': message.role === 'user',
                          },
                        )}
                      >
                        {/* Render structured response if available */}
                        {structuredResponse ? (
                          <StructuredResponseComponent
                            structuredResponse={structuredResponse.structured_response}
                            sources={structuredResponse.sources}
                            onSuggestedActionClick={handleSuggestedActionClick}
                          />
                        ) : (
                          <Markdown>{sanitizeText(displayText)}</Markdown>
                        )}

                        {/* Show knowledge graph and debug info for both structured and legacy responses */}
                        {(hasKG || hasDebugData) && (
                          <details className="mt-2">
                            <summary className="cursor-pointer select-none text-sm text-muted-foreground hover:text-foreground">
                              Visualize knowledge graph - Verify source materials
                            </summary>
                            <div className="mt-2 flex flex-col gap-3">
                              {parsedData?.preamble && (
                                <div className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground whitespace-pre-wrap max-h-60 overflow-auto">
                                  {parsedData.preamble}
                                </div>
                              )}
                              {hasKG && parsedData ? (
                                <KnowledgeGraphViewer
                                  nodes={parsedData.nodes}
                                  edges={parsedData.edges}
                                  types={parsedData.types}
                                  sourcesByIndex={parsedData.sourceIndexToUrl}
                                />
                              ) : null}
                            </div>
                          </details>
                        )}

                        {/* Debug: Show full response data in console and optionally on screen */}
                        {structuredResponse && (
                          <details className="mt-2">
                            <summary className="cursor-pointer select-none text-sm text-muted-foreground hover:text-foreground">
                              🔍 Debug: Full Response Data
                            </summary>
                            <div className="mt-2">
                              <pre className="text-xs bg-muted/30 p-3 rounded-md overflow-auto max-h-60 whitespace-pre-wrap">
                                {JSON.stringify(structuredResponse, null, 2)}
                              </pre>
                            </div>
                          </details>
                        )}
                      </div>
                    </div>
                  );
                }

                if (mode === 'edit') {
                  return (
                    <div key={key} className="flex flex-row gap-2 items-start">
                      <div className="size-8" />

                      <MessageEditor
                        key={message.id}
                        message={message}
                        setMode={setMode}
                        setMessages={setMessages}
                        regenerate={regenerate}
                      />
                    </div>
                  );
                }
              }

              if (type === 'tool-getWeather') {
                const { toolCallId, state } = part;

                if (state === 'input-available') {
                  return (
                    <div key={toolCallId} className="skeleton">
                      <Weather />
                    </div>
                  );
                }

                if (state === 'output-available') {
                  const { output } = part;
                  return (
                    <div key={toolCallId}>
                      <Weather weatherAtLocation={output} />
                    </div>
                  );
                }
              }

              if (type === 'tool-createDocument') {
                const { toolCallId, state } = part;

                if (state === 'input-available') {
                  const { input } = part;
                  return (
                    <div key={toolCallId}>
                      <DocumentPreview isReadonly={isReadonly} args={input} />
                    </div>
                  );
                }

                if (state === 'output-available') {
                  const { output } = part;

                  if ('error' in output) {
                    return (
                      <div
                        key={toolCallId}
                        className="text-red-500 p-2 border rounded"
                      >
                        Error: {String(output.error)}
                      </div>
                    );
                  }

                  return (
                    <div key={toolCallId}>
                      <DocumentPreview
                        isReadonly={isReadonly}
                        result={output}
                      />
                    </div>
                  );
                }
              }

              if (type === 'tool-updateDocument') {
                const { toolCallId, state } = part;

                if (state === 'input-available') {
                  const { input } = part;

                  return (
                    <div key={toolCallId}>
                      <DocumentToolCall
                        type="update"
                        args={input}
                        isReadonly={isReadonly}
                      />
                    </div>
                  );
                }

                if (state === 'output-available') {
                  const { output } = part;

                  if ('error' in output) {
                    return (
                      <div
                        key={toolCallId}
                        className="text-red-500 p-2 border rounded"
                      >
                        Error: {String(output.error)}
                      </div>
                    );
                  }

                  return (
                    <div key={toolCallId}>
                      <DocumentToolResult
                        type="update"
                        result={output}
                        isReadonly={isReadonly}
                      />
                    </div>
                  );
                }
              }

              if (type === 'tool-requestSuggestions') {
                const { toolCallId, state } = part;

                if (state === 'input-available') {
                  const { input } = part;
                  return (
                    <div key={toolCallId}>
                      <DocumentToolCall
                        type="request-suggestions"
                        args={input}
                        isReadonly={isReadonly}
                      />
                    </div>
                  );
                }

                if (state === 'output-available') {
                  const { output } = part;

                  if ('error' in output) {
                    return (
                      <div
                        key={toolCallId}
                        className="text-red-500 p-2 border rounded"
                      >
                        Error: {String(output.error)}
                      </div>
                    );
                  }

                  return (
                    <div key={toolCallId}>
                      <DocumentToolResult
                        type="request-suggestions"
                        result={output}
                        isReadonly={isReadonly}
                      />
                    </div>
                  );
                }
              }
            })}

            {!isReadonly && (
              <MessageActions
                key={`action-${message.id}`}
                chatId={chatId}
                message={message}
                vote={vote}
                isLoading={isLoading}
              />
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export const PreviewMessage = memo(
  PurePreviewMessage,
  (prevProps, nextProps) => {
    if (prevProps.isLoading !== nextProps.isLoading) return false;
    if (prevProps.message.id !== nextProps.message.id) return false;
    if (prevProps.requiresScrollPadding !== nextProps.requiresScrollPadding)
      return false;
    if (!equal(prevProps.message.parts, nextProps.message.parts)) return false;
    if (!equal(prevProps.vote, nextProps.vote)) return false;

    return false;
  },
);

export const ThinkingMessage = () => {
  const role = 'assistant';

  return (
    <motion.div
      data-testid="message-assistant-loading"
      className="w-full mx-auto max-w-3xl px-4 group/message min-h-96"
      initial={{ y: 5, opacity: 0 }}
      animate={{ y: 0, opacity: 1, transition: { delay: 1 } }}
      data-role={role}
    >
      <div
        className={cx(
          'flex gap-4 group-data-[role=user]/message:px-3 w-full group-data-[role=user]/message:w-fit group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl group-data-[role=user]/message:py-2 rounded-2xl glass-chat brand-border-accent',
        )}
      >
        <div className="size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border">
          <SparklesIcon size={14} />
        </div>

        <div className="flex flex-col gap-2 w-full">
          <div className="flex flex-col gap-4 text-muted-foreground">
            Hmm...
          </div>
        </div>
      </div>
    </motion.div>
  );
};

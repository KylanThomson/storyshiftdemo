'use client';

import { motion } from 'framer-motion';
import { Button } from './ui/button';
import { memo } from 'react';
import type { UseChatHelpers } from '@ai-sdk/react';
import type { VisibilityType } from './visibility-selector';
import type { ChatMessage } from '@/lib/types';
import { useBranding } from './branding-provider';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

interface SuggestedActionsProps {
  chatId: string;
  sendMessage: UseChatHelpers<ChatMessage>['sendMessage'];
  selectedVisibilityType: VisibilityType;
}

function PureSuggestedActions({
  chatId,
  sendMessage,
  selectedVisibilityType,
}: SuggestedActionsProps) {
  const { brand } = useBranding();
  const suggestedActions = brand.suggestedActions;

  return (
    <div
      data-testid="suggested-actions"
      className="grid sm:grid-cols-2 gap-2 w-full"
    >
      {suggestedActions.map((suggestedAction, index) => (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ delay: 0.05 * index }}
          key={`suggested-action-${suggestedAction.title}-${index}`}
          className={index > 1 ? 'hidden sm:block' : 'block'}
        >
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  title={`${suggestedAction.title} — ${suggestedAction.label}`}
                  onClick={async () => {
                    window.history.replaceState({}, '', `/chat/${chatId}`);

                    sendMessage({
                      role: 'user',
                      parts: [{ type: 'text', text: suggestedAction.action }],
                    });
                  }}
                  className="text-left border rounded-xl px-4 py-3.5 text-sm flex-1 gap-1 sm:flex-col w-full h-auto justify-start items-start"
                >
                  <span className="font-medium line-clamp-1 w-full">
                    {suggestedAction.title}
                  </span>
                  <span className="text-muted-foreground line-clamp-2 w-full break-words">
                    {suggestedAction.label}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-[28rem] whitespace-pre-wrap break-words">
                <div className="space-y-1">
                  <div className="font-medium">{suggestedAction.title}</div>
                  <div className="text-muted-foreground">{suggestedAction.label}</div>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </motion.div>
      ))}
    </div>
  );
}

export const SuggestedActions = memo(PureSuggestedActions);

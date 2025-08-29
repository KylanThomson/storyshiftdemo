'use client';

import { motion } from 'framer-motion';
import { Button } from './ui/button';
import { memo } from 'react';
import type { UseChatHelpers } from '@ai-sdk/react';
import type { VisibilityType } from './visibility-selector';
import type { ChatMessage } from '@/lib/types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

interface DynamicSuggestedActionsProps {
    chatId: string;
    sendMessage: UseChatHelpers<ChatMessage>['sendMessage'];
    selectedVisibilityType: VisibilityType;
    suggestedActions: Array<{ action: string; description: string }>;
}

function PureDynamicSuggestedActions({
    chatId,
    sendMessage,
    selectedVisibilityType,
    suggestedActions,
}: DynamicSuggestedActionsProps) {
    if (!suggestedActions || suggestedActions.length === 0) {
        return null;
    }

    return (
        <div
            data-testid="dynamic-suggested-actions"
            className="grid sm:grid-cols-2 gap-2 w-full"
        >
            {suggestedActions.map((suggestedAction, index) => (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    transition={{ delay: 0.05 * index }}
                    key={`dynamic-suggested-action-${suggestedAction.action}-${index}`}
                    className={index > 1 ? 'hidden sm:block' : 'block'}
                >
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    title={`${suggestedAction.action} — ${suggestedAction.description}`}
                                    onClick={async () => {
                                        window.history.replaceState({}, '', `/chat/${chatId}`);

                                        // Send both the action title and its description as a single user message
                                        const combinedText = `${suggestedAction.action}\n${suggestedAction.description}`;
                                        sendMessage({
                                            role: 'user',
                                            parts: [{ type: 'text', text: combinedText }],
                                        });
                                    }}
                                    className="text-left border rounded-xl px-4 py-3.5 text-sm flex-1 gap-1 sm:flex-col w-full h-auto justify-start items-start"
                                >
                                    <span className="font-medium line-clamp-1 w-full">
                                        {suggestedAction.action}
                                    </span>
                                    <span className="text-muted-foreground line-clamp-2 w-full break-words">
                                        {suggestedAction.description}
                                    </span>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[28rem] whitespace-pre-wrap break-words">
                                <div className="space-y-1">
                                    <div className="font-medium">{suggestedAction.action}</div>
                                    <div className="text-muted-foreground">{suggestedAction.description}</div>
                                </div>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </motion.div>
            ))}
        </div>
    );
}

export const DynamicSuggestedActions = memo(PureDynamicSuggestedActions);

import { z } from 'zod';

const textPartSchema = z.object({
  type: z.enum(['text']),
  text: z.string().min(1).max(1000000),
});

const filePartSchema = z.object({
  type: z.enum(['file']),
  mediaType: z.enum(['image/jpeg', 'image/png', 'application/json', 'text/plain']),
  name: z.string().min(1).max(100),
  url: z.string().url(),
});

const partSchema = z.union([textPartSchema, filePartSchema]);

export const postRequestBodySchema = z.object({
  id: z.string().uuid(),
  message: z.object({
    id: z.string().uuid(),
    role: z.enum(['user']),
    parts: z.array(partSchema),
  }),
  selectedVisibilityType: z.enum(['public', 'private']),
  selectedBrandId: z.enum(['storyshift', 'usi', 'messinglaw', 'letsgobegreeat']).optional(),
});

export type PostRequestBody = z.infer<typeof postRequestBodySchema>;

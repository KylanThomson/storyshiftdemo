# Chat API Documentation

This document describes the structure and behavior of the chat API endpoints and the knowledge graph system used in this AI chatbot application.

## Chat API Endpoint

### POST `/api/chat`

The main chat endpoint that processes user messages and returns AI-generated responses with integrated knowledge graph data.

#### Request Structure

```typescript
interface PostRequestBody {
  id: string; // UUID for the chat session
  message: {
    id: string; // UUID for the message
    role: 'user';
    parts: Array<TextPart | FilePart>;
  };
  selectedVisibilityType: 'public' | 'private';
  selectedBrandId?: 'storyshift' | 'usi' | 'messinglaw' | 'letsgobegreeat';
}

interface TextPart {
  type: 'text';
  text: string; // 1-1,000,000 characters
}

interface FilePart {
  type: 'file';
  mediaType: 'image/jpeg' | 'image/png' | 'application/json' | 'text/plain';
  name: string; // 1-100 characters
  url: string; // Valid URL
}
```

#### Response Structure

The API returns a JSON response with the following structure:

```typescript
interface ChatResponse {
  id: string; // UUID for the response message
  role: 'assistant';
  content: string; // The complete response text including answer, facts, and sources
  createdAt: string; // ISO timestamp
}
```

#### Response Content Format

The `content` field contains structured text with the following sections:

1. **Main Answer**: The primary AI-generated response to the user's question
2. **Retrieved Facts** (optional): Bullet points of knowledge graph facts used to generate the answer
3. **Sources** (optional): Numbered list of source URLs referenced in the facts

Example response content:
```
The main answer to your question goes here.

**Retrieved Facts:**
• (service:"disease management programs" url=https://example.com) -[MITIGATES]-> (risk:"high-cost complications") [1]
• (organization:"healthcare provider" page=5) -[IMPLEMENTS]-> (service:"preventive care") [2]

**Sources:**
[1] https://example.com/healthcare-study
[2] https://example.com/preventive-care-guide
```

### DELETE `/api/chat`

Deletes a chat session.

#### Query Parameters
- `id`: The chat session UUID to delete

#### Response
Returns the deleted chat object on success.

## Additional API Endpoints

### GET `/api/history`

Retrieves chat history for the authenticated user.

#### Query Parameters
- `limit`: Number of chats to return (default: 10)
- `starting_after`: Pagination cursor for chats after this ID
- `ending_before`: Pagination cursor for chats before this ID

#### Response
Returns an array of chat objects with metadata.

### GET `/api/vote`

Retrieves votes for messages in a specific chat.

#### Query Parameters
- `chatId`: The chat session UUID (required)

#### Response
Returns vote data for messages in the chat.

### PATCH `/api/vote`

Submits a vote (up/down) for a specific message.

#### Request Body
```typescript
{
  chatId: string;
  messageId: string;
  type: 'up' | 'down';
}
```

#### Response
Returns success message on completion.

### GET `/api/auth/session`

Retrieves the current authentication session.

#### Response
Returns user session data or null if not authenticated.

## Knowledge Graph System

The application integrates with a Fast GraphRAG (Graph Retrieval-Augmented Generation) system that provides structured knowledge data to enhance AI responses.

### GraphRAG API Integration

#### Request to GraphRAG Service

```typescript
interface GraphRAGRequest {
  company: string; // Tenant identifier based on brand
  question: string; // User's question
  database?: string; // Database type (default: 'neo4j')
}
```

#### Response from GraphRAG Service

```typescript
interface FastGraphRAGResponse {
  tenant: string; // The company/tenant identifier
  question: string; // The original question
  answer: string | null; // AI-generated answer
  sources: Array<{ id: number; url: string }>; // Source references
  factsPreview: string[]; // Array of fact strings (max 10 displayed)
  diagnostics?: any; // Optional diagnostic information
}
```

### Knowledge Graph Data Structure

The knowledge graph data is parsed from the GraphRAG response and structured into nodes and edges for visualization.

#### Node Structure

```typescript
interface KGNode {
  id: string; // Unique identifier (format: "type:label")
  type: string; // Entity type (e.g., "service", "risk", "organization")
  label: string; // Display name for the entity
  url?: string; // Optional URL for the entity
  page?: string; // Optional page reference
  attrs?: Record<string, string>; // Additional attributes
}
```

#### Edge Structure

```typescript
interface KGEdge {
  id: string; // Unique identifier
  source: string; // Source node ID
  target: string; // Target node ID
  label: string; // Relationship type (e.g., "MITIGATES", "IMPLEMENTS")
  sources?: string[]; // URLs referenced by this relationship
  sourceIndices?: number[]; // Source indices for citation badges
}
```

#### Parsed Facts Structure

```typescript
interface ParsedFacts {
  cleanText: string; // Response text with facts/sources sections removed
  nodes: KGNode[]; // Array of knowledge graph nodes
  edges: KGEdge[]; // Array of knowledge graph edges
  types: string[]; // Unique entity types for layout
  sourceIndexToUrl?: Record<number, string>; // Mapping of source indices to URLs
}
```

### Facts Format in Response Text

The knowledge graph facts are embedded in the response text using a specific format:

```
Retrieved Facts:
• (entityType:"entity label" url=https://example.com page=1) -[RELATIONSHIP_TYPE]-> (targetType:"target label") [1][2]
• (service:"risk management" url=https://example.com) -[ADDRESSES]-> (risk:"compliance issues") [3]

Sources:
[1] https://source1.com
[2] https://source2.com
[3] https://source3.com
```

#### Fact Parsing Rules

1. **Entity Format**: `(type:"label" attribute=value)`
   - `type`: The entity category (e.g., service, risk, organization)
   - `label`: The entity name (quoted string)
   - Additional attributes like `url`, `page` can be included

2. **Relationship Format**: `-[RELATIONSHIP_TYPE]->`
   - Directed relationship from source to target entity
   - Relationship type in brackets (e.g., MITIGATES, IMPLEMENTS, ADDRESSES)

3. **Source References**: `[1][2][3]`
   - Numbered references to sources listed in the Sources section
   - Multiple indices can be associated with a single fact

### Brand-to-Tenant Mapping

The system maps UI brand identifiers to GraphRAG tenant keys:

```typescript
function brandIdToTenant(id?: BrandId): string {
  switch (id) {
    case 'letsgobegreeat': return 'lets_go_be_great';
    case 'messinglaw': return 'messing_law';
    case 'usi': return 'usi';
    case 'storyshift':
    default: return 'storyshift';
  }
}
```

## Error Handling

The API uses structured error responses:

```typescript
class ChatSDKError {
  constructor(type: string) // e.g., 'bad_request:api', 'unauthorized:chat'
  toResponse(): Response // Returns appropriate HTTP response
}
```

Common error types:
- `bad_request:api` - Invalid request format (400)
- `unauthorized:chat` - User not authenticated (401)
- `forbidden:chat` - User doesn't own the chat (403)
- `not_found:chat` - Chat session not found (404)
- `rate_limit:chat` - User exceeded daily message limit (429)
- `offline:chat` - GraphRAG service unavailable (503)

## HTTP Status Codes

The API uses standard HTTP status codes to indicate success or failure:

### Success Codes
- **200 OK** - Request successful
- **201 Created** - Resource created successfully

### Client Error Codes
- **400 Bad Request** - Invalid request format or missing required parameters
- **401 Unauthorized** - Authentication required or invalid credentials
- **403 Forbidden** - User doesn't have permission to access the resource
- **404 Not Found** - Requested resource doesn't exist
- **429 Too Many Requests** - Rate limit exceeded (daily message limit reached)

### Server Error Codes
- **500 Internal Server Error** - Unexpected server error
- **503 Service Unavailable** - External service (GraphRAG) temporarily unavailable

### Common Status Code Scenarios

**POST /api/chat 429** - You've exceeded your daily message limit. The system enforces rate limiting based on user type:
- Check your user entitlements in the database
- Wait for the 24-hour window to reset
- Contact admin to increase your message limit

**GET /api/vote 404** - The chat ID doesn't exist or you don't have access:
- Verify the chat ID is correct
- Ensure you're the owner of the chat session
- Check if the chat was deleted

**GET /api/auth/session 200** - Authentication session retrieved successfully
**GET /api/history 200** - Chat history retrieved successfully

## Authentication & Authorization

- All chat endpoints require user authentication via Auth.js
- Users can only access their own chat sessions
- Rate limiting is enforced based on user type and daily message limits
- Message count tracking is implemented with 24-hour rolling windows

## Data Persistence

- Chat sessions are saved to the database with title, visibility, and brand association
- All messages (user and assistant) are persisted with full content and metadata
- Stream IDs are generated for UI compatibility even though responses are returned as JSON

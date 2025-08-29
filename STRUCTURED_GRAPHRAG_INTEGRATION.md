# Structured GraphRAG Integration

This document outlines the integration of the new structured GraphRAG output format into the frontend application.

## Overview

The backend cloud function now returns structured output in addition to the previous format. The frontend has been adapted to handle both the new structured format and maintain backward compatibility with the legacy format.

## Backend Changes

### Cloud Function Response Format

The new structured response includes:

```typescript
{
  tenant: string;
  question: string;
  structured_response: {
    Research: {
      targets: string[];
      findings: Array<{
        title?: string;
        url: string;
        snippet: string;
      }>;
    };
    Chat_Response: string;
    Suggested_Actions: Array<{
      action: string;
      description: string;
    }>;
  };
  sources: Array<{ id: number; url: string }>;
  factsPreview: string[];
  diagnostics?: any;
}
```

### API Endpoint

- **New Endpoint**: `https://structuredgraphrag-660323987151.us-east4.run.app/structured_graphrag_qa`
- **Legacy Endpoint**: Still supported for backward compatibility

## Frontend Changes

### 1. API Layer (`lib/graphrag/api.ts`)

- Added new types: `StructuredResponse`, `StructuredGraphRAGResponse`
- Added `callStructuredGraphRAG()` function
- Updated default API URL to use the structured endpoint
- Added debug logging to print full response to browser console

### 2. New Components

#### `components/structured-response.tsx`
A comprehensive component that displays:
- **Main Chat Response**: The primary answer with markdown support
- **Research Section**: Collapsible section showing research targets and findings
- **Sources Section**: Collapsible section with clickable source links
- **Suggested Actions**: Interactive buttons for follow-up actions

Features:
- Animated collapsible sections
- Citation linking with `[n]` format
- Responsive design
- Interactive suggested actions

#### `lib/graphrag/parse-structured-response.ts`
Parser utilities that handle both structured and legacy formats:
- `parseStructuredGraphRAGResponse()`: Parses new structured format
- `parseLegacyGraphRAGResponse()`: Handles backward compatibility
- Helper functions for detecting data types
- Knowledge graph extraction from both formats

### 3. Updated Components

#### `components/message.tsx`
- Added structured response detection
- Integrated `StructuredResponseComponent` for new format
- Maintained backward compatibility with legacy parsing
- Added debug section showing full response data
- Enhanced knowledge graph visualization support

#### `app/(chat)/api/chat/route.ts`
- Updated to try structured API first, fallback to legacy
- Added proper error handling and logging
- Returns structured format as JSON for frontend parsing
- Maintains database compatibility

### 4. Environment Variables

Added new environment variables in `.env.example`:
```bash
# Structured GraphRAG API (new structured output format)
STRUCTURED_GRAPHRAG_QA_URL=https://structuredgraphrag-660323987151.us-east4.run.app/structured_graphrag_qa
STRUCTURED_GRAPHRAG_DATABASE=neo4j
```

## Features

### 1. Structured Response Display
- **Research Findings**: Expandable section showing research targets and key findings
- **Citations**: Proper citation linking with `[n]` format
- **Sources**: Collapsible source list with clickable links
- **Suggested Actions**: Interactive follow-up action buttons

### 2. Knowledge Graph Integration
- Extracts knowledge graph data from both structured and legacy responses
- Maintains existing knowledge graph visualization
- Supports citations and source linking

### 3. Debug Capabilities
- Full response logging to browser console
- Debug section in UI showing raw response data
- Helpful for troubleshooting and development

### 4. Backward Compatibility
- Automatically falls back to legacy API if structured API fails
- Supports existing message formats
- Maintains all existing functionality

## Usage

### For Users
1. Ask questions as normal - the system automatically uses the best available API
2. Expand "Research Findings" to see detailed research data
3. Click "Sources" to view and access source materials
4. Use "Suggested Follow-up Actions" for related queries
5. Use "Debug: Full Response Data" for troubleshooting

### For Developers
1. Set up environment variables for the structured API
2. The system automatically tries structured API first, falls back to legacy
3. Check browser console for full response logging
4. Use the debug section in messages for detailed inspection

## Error Handling

The integration includes robust error handling:
1. **Structured API Failure**: Automatically falls back to legacy API
2. **Both APIs Fail**: Returns appropriate error response
3. **Parsing Errors**: Gracefully handles malformed responses
4. **Network Issues**: Proper timeout and retry logic

## Testing

To test the integration:
1. Send a message through the chat interface
2. Check browser console for API call logs
3. Verify structured response display in the UI
4. Test knowledge graph visualization
5. Try suggested actions functionality

## Migration Notes

- **No Breaking Changes**: Existing functionality is preserved
- **Gradual Rollout**: New features are additive
- **Fallback Support**: Legacy API remains functional
- **Environment Setup**: New environment variables need to be configured

## Future Enhancements

Potential improvements:
1. **Action Integration**: Connect suggested actions to chat system
2. **Enhanced Visualization**: Improve research findings display
3. **Caching**: Add response caching for better performance
4. **Analytics**: Track usage of structured features
5. **Customization**: Allow users to configure display preferences

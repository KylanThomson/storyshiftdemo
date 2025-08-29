# Knowledge Graph System Documentation

This document provides detailed information about the knowledge graph system integrated into the AI chatbot, including its architecture, data flow, visualization, and usage patterns.

## Overview

The knowledge graph system enhances AI responses by providing structured, factual information retrieved from a graph database. It uses Fast GraphRAG (Graph Retrieval-Augmented Generation) to query knowledge graphs and present the results both textually and visually.

## Architecture

```
User Question → Chat API → GraphRAG Service → Neo4j Database
                    ↓
Frontend ← Knowledge Graph Visualization ← Parsed Facts ← GraphRAG Response
```

### Components

1. **GraphRAG API Service** (`lib/graphrag/api.ts`)
   - Interfaces with the Fast GraphRAG cloud function
   - Handles tenant mapping and request/response formatting
   - Manages timeouts and error handling

2. **Facts Parser** (`lib/graphrag/parse-retrieved-facts.ts`)
   - Extracts structured knowledge graph data from text responses
   - Parses entities, relationships, and source citations
   - Cleans response text for display

3. **Knowledge Graph Viewer** (`components/knowledge-graph.tsx`)
   - Renders interactive SVG visualization of graph data
   - Provides entity grouping, relationship arrows, and source citations
   - Supports click-through to source URLs

## Data Flow

### 1. Request Processing

When a user submits a question:

1. The chat API extracts the text content from the user's message
2. The selected brand ID is mapped to a tenant identifier
3. A request is sent to the GraphRAG service with:
   ```typescript
   {
     company: "tenant_name",
     question: "user's question",
     database: "neo4j"
   }
   ```

### 2. GraphRAG Response

The GraphRAG service returns structured data:

```typescript
{
  tenant: "tenant_name",
  question: "original question",
  answer: "AI-generated answer",
  sources: [
    { id: 1, url: "https://source1.com" },
    { id: 2, url: "https://source2.com" }
  ],
  factsPreview: [
    "(service:\"risk management\" url=https://example.com) -[ADDRESSES]-> (risk:\"compliance issues\") [1]",
    "(organization:\"healthcare provider\") -[IMPLEMENTS]-> (service:\"preventive care\") [2]"
  ]
}
```

### 3. Response Formatting

The chat API formats the response as:

```
[AI Answer]

**Retrieved Facts:**
• [Fact 1 with entities and relationships]
• [Fact 2 with entities and relationships]

**Sources:**
[1] https://source1.com
[2] https://source2.com
```

### 4. Frontend Processing

The frontend:

1. Receives the formatted response
2. Parses the facts section to extract nodes and edges
3. Renders the knowledge graph visualization
4. Displays the cleaned text without the facts section

## Knowledge Graph Visualization

### Node Representation

Nodes represent entities in the knowledge graph:

- **Visual**: Rounded rectangles with entity labels
- **Grouping**: Organized in columns by entity type
- **Colors**: Brand-themed colors for the first 5 types, hashed colors for additional types
- **Interaction**: Clickable if URL is provided
- **Citations**: Source badges displayed above nodes

### Edge Representation

Edges represent relationships between entities:

- **Visual**: Directed arrows with relationship labels
- **Interaction**: Clickable if sources are available
- **Labels**: Relationship type displayed at midpoint

### Layout Algorithm

1. **Column-based Layout**: Entities grouped by type in vertical columns
2. **Vertical Distribution**: Entities evenly spaced within each column
3. **Dynamic Sizing**: SVG viewBox adjusts based on content
4. **Responsive Design**: Scales to container width

### Color System

```typescript
// Brand colors for first 5 entity types
const brandColors = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))'
];

// Hashed colors for additional types
function hashColor(typeName: string) {
  // Deterministic pastel color generation
  const hue = hash(typeName) % 360;
  return `hsl(${hue} 80% 92%)`;
}
```

## Entity and Relationship Types

### Common Entity Types

- **service**: Business services or offerings
- **risk**: Risk factors or concerns
- **organization**: Companies, departments, or institutions
- **person**: Individuals or roles
- **document**: Reports, policies, or documentation
- **location**: Geographic or organizational locations
- **technology**: Systems, tools, or platforms

### Common Relationship Types

- **MITIGATES**: Service reduces or addresses a risk
- **IMPLEMENTS**: Organization puts a service into practice
- **ADDRESSES**: Direct response to a concern or issue
- **MANAGES**: Oversight or control relationship
- **PROVIDES**: Service or resource provision
- **REQUIRES**: Dependency relationship
- **SUPPORTS**: Enabling or assistance relationship

## Fact Format Specification

### Entity Syntax

```
(entityType:"entity label" attribute=value attribute2=value2)
```

**Components:**
- `entityType`: Category of the entity (required)
- `"entity label"`: Display name in quotes (required)
- `attribute=value`: Additional metadata (optional)

**Common Attributes:**
- `url`: Web link for the entity
- `page`: Page number or reference
- `id`: Unique identifier

### Relationship Syntax

```
(source_entity) -[RELATIONSHIP_TYPE]-> (target_entity)
```

**Components:**
- Source and target entities in parentheses
- Relationship type in square brackets
- Arrow indicates direction: `-[TYPE]->`

### Source Citation Syntax

```
[1][2][3]
```

- Numbered references in square brackets
- Multiple citations can be associated with one fact
- Numbers correspond to the Sources section

### Complete Fact Example

```
(service:"disease management programs" url=https://healthcare.com page=15) -[MITIGATES]-> (risk:"high-cost complications" id=risk_001) [1][3]
```

This represents:
- A service entity with URL and page attributes
- A risk entity with an ID attribute
- A "MITIGATES" relationship from service to risk
- Citations to sources [1] and [3]

## Integration Points

### Frontend Components

1. **Message Component** (`components/message.tsx`)
   - Parses facts from assistant messages
   - Renders knowledge graph when facts are present
   - Displays cleaned text content

2. **Knowledge Graph Viewer** (`components/knowledge-graph.tsx`)
   - Interactive SVG visualization
   - Entity and relationship rendering
   - Source citation handling

### Backend Services

1. **Chat API Route** (`app/(chat)/api/chat/route.ts`)
   - Calls GraphRAG service
   - Formats response with facts and sources
   - Handles error cases

2. **GraphRAG API** (`lib/graphrag/api.ts`)
   - Service interface and type definitions
   - Tenant mapping logic
   - Request/response handling

## Configuration

### Environment Variables

```bash
# GraphRAG service endpoint
FAST_GRAPHRAG_QA_URL=http://localhost:8080/fast_graphrag_qa

# Database type (default: neo4j)
FAST_GRAPHRAG_DATABASE=neo4j
```

### Brand-to-Tenant Mapping

```typescript
const brandMapping = {
  'storyshift': 'storyshift',
  'usi': 'usi',
  'messinglaw': 'messing_law',
  'letsgobegreeat': 'lets_go_be_great'
};
```

## Performance Considerations

### Caching

- Color calculations are cached to prevent layout thrash
- SVG rendering optimizations for large graphs
- Efficient text width estimation for node sizing

### Limitations

- Maximum 10 facts displayed in preview
- Node labels truncated to prevent overflow
- Timeout protection for GraphRAG requests (30 seconds)

### Scalability

- Column-based layout scales with entity types
- Dynamic height adjustment for varying node counts
- Responsive design adapts to container size

## Error Handling

### GraphRAG Service Errors

- Network timeouts return fallback response
- Service unavailable triggers `offline:chat` error
- Malformed responses handled gracefully

### Parsing Errors

- Invalid fact format ignored silently
- Partial parsing continues with valid facts
- Empty results still return cleaned text

### Visualization Errors

- Missing nodes/edges handled gracefully
- Color calculation failures use defaults
- Click handlers protected with try-catch

## Usage Examples

### Basic Query Flow

```typescript
// 1. User asks question
const userMessage = "What are the main risks in healthcare?";

// 2. API calls GraphRAG
const response = await callFastGraphRAG('healthcare_tenant', userMessage);

// 3. Response includes structured facts
const facts = response.factsPreview; // Array of fact strings

// 4. Frontend parses and visualizes
const parsed = parseRetrievedFacts(responseText);
if (parsed) {
  // Render knowledge graph with parsed.nodes and parsed.edges
}
```

### Custom Entity Types

To add support for new entity types:

1. Update the GraphRAG service to return the new type
2. Ensure proper parsing in `parseEntity()` function
3. Add color mapping if needed in `brandColorForColumn()`
4. Update documentation with new type definitions

## Troubleshooting

### Common Issues

1. **No facts displayed**: Check GraphRAG service connectivity
2. **Parsing errors**: Verify fact format matches specification
3. **Visualization problems**: Check browser console for SVG errors
4. **Missing sources**: Ensure source indices match Sources section

### Debug Information

Enable diagnostics in GraphRAG response:
```typescript
interface FastGraphRAGResponse {
  // ... other fields
  diagnostics?: {
    queryTime: number;
    nodeCount: number;
    edgeCount: number;
  };
}
```

### Monitoring

- Track GraphRAG response times
- Monitor parsing success rates
- Log visualization rendering errors
- Measure user interaction with graph elements

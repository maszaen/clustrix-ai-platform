/*
Language: Mermaid
Description: Mermaid is a JavaScript-based diagramming and charting tool that renders Markdown-inspired text definitions to create and modify diagrams dynamically.
Author: Clustrix AI Platform
Website: https://mermaid.js.org
Category: markup
*/

export default function(hljs) {
  const DIAGRAM_TYPES = [
    'flowchart', 'graph', 'sequenceDiagram', 'classDiagram', 'stateDiagram', 'stateDiagram-v2',
    'erDiagram', 'journey', 'gantt', 'pie', 'quadrantChart', 'requirementDiagram',
    'gitGraph', 'C4Context', 'C4Container', 'C4Component', 'C4Deployment', 'C4Dynamic',
    'mindmap', 'timeline', 'zenuml', 'sankey-beta'
  ];

  const FLOWCHART_KEYWORDS = [
    'subgraph', 'end', 'direction', 'TB', 'TD', 'BT', 'RL', 'LR'
  ];

  const SEQUENCE_KEYWORDS = [
    'participant', 'actor', 'note', 'over', 'left of', 'right of',
    'activate', 'deactivate', 'loop', 'alt', 'else', 'opt', 'par', 'and',
    'critical', 'break', 'rect', 'autonumber', 'box', 'end'
  ];

  const CLASS_KEYWORDS = [
    'class', 'namespace', 'note', 'direction', 'link', 'click', 'callback',
    '<<interface>>', '<<abstract>>', '<<service>>', '<<enumeration>>'
  ];

  const STATE_KEYWORDS = [
    'state', 'note', 'left of', 'right of', 'direction', 'fork', 'join',
    'choice', 'concurrent', 'state', 'hide empty description'
  ];

  const ER_KEYWORDS = [
    'entity', 'relationship', 'attribute'
  ];

  const GANTT_KEYWORDS = [
    'title', 'dateFormat', 'axisFormat', 'todayMarker', 'excludes', 'includes',
    'section', 'done', 'active', 'crit', 'milestone', 'after'
  ];

  const JOURNEY_KEYWORDS = [
    'title', 'section'
  ];

  const C4_KEYWORDS = [
    'Person', 'Person_Ext', 'System', 'System_Ext', 'SystemDb', 'SystemQueue',
    'System_Boundary', 'Boundary', 'Container', 'ContainerDb', 'ContainerQueue',
    'Container_Boundary', 'Component', 'ComponentDb', 'ComponentQueue',
    'Deployment_Node', 'Node', 'Rel', 'BiRel', 'Rel_Up', 'Rel_Down', 'Rel_Left',
    'Rel_Right', 'Rel_Back', 'RelIndex', 'UpdateElementStyle', 'UpdateRelStyle',
    'UpdateLayoutConfig'
  ];

  const ALL_KEYWORDS = [
    ...DIAGRAM_TYPES,
    ...FLOWCHART_KEYWORDS,
    ...SEQUENCE_KEYWORDS,
    ...CLASS_KEYWORDS,
    ...STATE_KEYWORDS,
    ...ER_KEYWORDS,
    ...GANTT_KEYWORDS,
    ...JOURNEY_KEYWORDS,
    ...C4_KEYWORDS
  ].join(' ');

  const COMMENT = hljs.COMMENT('%%', '$');

  const STRING = {
    className: 'string',
    variants: [
      { begin: '"', end: '"', contains: [hljs.BACKSLASH_ESCAPE] },
      { begin: "'", end: "'", contains: [hljs.BACKSLASH_ESCAPE] }
    ]
  };

  const NODE_TEXT = {
    className: 'string',
    variants: [
      { begin: /\[/, end: /\]/, contains: [hljs.BACKSLASH_ESCAPE] },
      { begin: /\(\[/, end: /\]\)/ },
      { begin: /\[\[/, end: /\]\]/ },
      { begin: /\[\(/, end: /\)\]/ },
      { begin: /\(\(/, end: /\)\)/ },
      { begin: /\{/, end: /\}/ },
      { begin: />/, end: /\]/ }
    ]
  };

  const ARROW = {
    className: 'operator',
    variants: [
      { match: /<-->|<-.->|<==>/},
      { match: /-->|==>|-.->|-\.->/},
      { match: /--[ox]|==x|-->/},
      { match: /->>|\+>>|-->>|\)>>|-x>|-\)>|--x>|-->>/},
      { match: /---/},
      { match: /<\|--|\|o--|\}o--|\|\|--|\}o--/},
      { match: /--o\{|--o\||--\|\{|--\|\|/},
      { match: /<\|\.\.|\|o\.\.|\}o\.\.|\|\|\.\.|\}o\.\./},
      { match: /\.\.\|o|\.\.\|\{|\.\.\|\|/},
      { match: /:::/ }
    ]
  };

  const DIRECTIVE = {
    className: 'meta',
    begin: /^%%\{/,
    end: /\}%%$/,
    contains: [STRING, hljs.NUMBER_MODE]
  };

  const DIAGRAM_DECLARATION = {
    className: 'keyword',
    begin: /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram-v2|stateDiagram|erDiagram|journey|gantt|pie|quadrantChart|requirementDiagram|gitGraph|C4Context|C4Container|C4Component|C4Deployment|C4Dynamic|mindmap|timeline|zenuml|sankey-beta)\b/,
    relevance: 10
  };

  const CLASS_RELATION = {
    className: 'operator',
    match: /<\|--|<\|\.\.|\*--|o--|<--|\.\.|--|>\||\*|\+|#|~/
  };

  const ENTITY_RELATION = {
    className: 'operator',
    match: /\|\|--\|\||o\|--\|\||}\|--\|\||o\|--o\||}\|--o\||o\|--}\|/
  };

  return {
    name: 'Mermaid',
    aliases: ['mermaid', 'mmd'],
    case_insensitive: false,
    keywords: {
      keyword: ALL_KEYWORDS,
      literal: 'true false null'
    },
    contains: [
      COMMENT,
      DIRECTIVE,
      DIAGRAM_DECLARATION,
      STRING,
      NODE_TEXT,
      ARROW,
      CLASS_RELATION,
      ENTITY_RELATION,
      {
        className: 'number',
        variants: [
          { begin: /\b\d+(?:\.\d+)?%?/ },
          hljs.NUMBER_MODE
        ]
      },
      {
        className: 'title',
        begin: /^[\s]*title\s+/,
        end: /$/,
        keywords: 'title'
      },
      {
        className: 'attr',
        begin: /\b(style|class|classDef|click|callback|link)\b/
      },
      {
        className: 'symbol',
        match: /\b[A-Z][A-Za-z0-9_]*\b/
      }
    ]
  };
}
const { ChatOpenAI } = require("@langchain/openai");
const { PromptTemplate } = require("@langchain/core/prompts");
const { StringOutputParser } = require("@langchain/core/output_parsers");
const { RunnableSequence } = require("@langchain/core/runnables");

class ClustrixAgentSystem {
  constructor(langchainService) {
    this.langchainService = langchainService;
    this.agents = {
      codeAgent: new CodeAnalysisAgent(langchainService),
      researchAgent: new ResearchAgent(langchainService),
      debugAgent: new DebuggingAgent(langchainService),
      projectAgent: new ProjectManagementAgent(langchainService)
    };
  }

  async processWithAgent(userMessage, sessionId, session, model, apiKey) {
    const intent = await this.langchainService.detectIntent(userMessage);
    const agent = this.selectAgent(intent);
    
    return await agent.process(userMessage, sessionId, session, model, apiKey);
  }

  selectAgent(intent) {
    switch (intent) {
      case 'coding':
        return this.agents.codeAgent;
      case 'research':
        return this.agents.researchAgent;
      case 'debugging':
        return this.agents.debugAgent;
      default:
        return this.agents.projectAgent;
    }
  }
}

class BaseAgent {
  constructor(langchainService) {
    this.langchainService = langchainService;
  }

  async createLLM(model, apiKey) {
    return new ChatOpenAI({
      modelName: model,
      openAIApiKey: apiKey,
      temperature: 0.1,
    });
  }

  async getRelevantContext(userMessage, sessionId) {
    return await this.langchainService.searchRelevantContent(userMessage, sessionId, 5);
  }
}

class CodeAnalysisAgent extends BaseAgent {
  async process(userMessage, sessionId, session, model, apiKey) {
    const llm = await this.createLLM(model, apiKey);
    const relevantContext = await this.getRelevantContext(userMessage, sessionId);
    
    const codeAnalysisPrompt = PromptTemplate.fromTemplate(`
You are a senior software engineer specializing in code analysis, architecture, and implementation.

CONTEXT FROM PROJECT FILES:
{context}

USER REQUEST:
{userMessage}

ANALYSIS FRAMEWORK:
1. **Code Review**: Analyze provided code for best practices, security, performance
2. **Architecture Assessment**: Evaluate system design, patterns, and structure  
3. **Implementation Plan**: Provide step-by-step implementation approach
4. **Testing Strategy**: Suggest testing approaches and edge cases
5. **Optimization Opportunities**: Identify performance and maintainability improvements

Provide a comprehensive response with:
- Clear, actionable recommendations
- Working code examples when applicable
- Security considerations
- Performance implications
- Maintenance and scalability factors

Focus on production-ready solutions with proper error handling.
`);

    const chain = RunnableSequence.from([
      codeAnalysisPrompt,
      llm,
      new StringOutputParser(),
    ]);

    const context = relevantContext.map(doc => 
      `[${doc.metadata.fileName}]\n${doc.content}`
    ).join('\n\n');

    return await chain.invoke({
      context: context || "No specific project files available.",
      userMessage: userMessage
    });
  }
}

class ResearchAgent extends BaseAgent {
  async process(userMessage, sessionId, session, model, apiKey) {
    const llm = await this.createLLM(model, apiKey);
    const relevantContext = await this.getRelevantContext(userMessage, sessionId);
    
    const researchPrompt = PromptTemplate.fromTemplate(`
You are a research specialist with expertise in information synthesis and analysis.

PROJECT CONTEXT:
{context}

RESEARCH REQUEST:
{userMessage}

RESEARCH METHODOLOGY:
1. **Information Synthesis**: Analyze all available project data and context
2. **Gap Analysis**: Identify what information is missing or needs clarification
3. **Cross-Reference**: Connect findings with project requirements and constraints
4. **Recommendations**: Provide actionable insights and next steps
5. **Resource Identification**: Suggest additional tools, libraries, or approaches

Deliver a structured research response with:
- Executive summary of findings
- Detailed analysis with supporting evidence
- Practical recommendations
- Potential risks and mitigation strategies
- Suggested follow-up research areas

Base your research on the provided project context and expand with industry best practices.
`);

    const chain = RunnableSequence.from([
      researchPrompt,
      llm,
      new StringOutputParser(),
    ]);

    const context = relevantContext.map(doc => 
      `[${doc.metadata.fileName}]\n${doc.content}`
    ).join('\n\n');

    return await chain.invoke({
      context: context || "No specific project context available.",
      userMessage: userMessage
    });
  }
}

class DebuggingAgent extends BaseAgent {
  async process(userMessage, sessionId, session, model, apiKey) {
    const llm = await this.createLLM(model, apiKey);
    const relevantContext = await this.getRelevantContext(userMessage, sessionId);
    
    const debuggingPrompt = PromptTemplate.fromTemplate(`
You are a debugging expert with deep knowledge of troubleshooting and problem resolution.

PROJECT CODE AND CONTEXT:
{context}

ISSUE DESCRIPTION:
{userMessage}

DEBUGGING PROTOCOL:
1. **Problem Analysis**: Break down the issue into specific, testable components
2. **Root Cause Investigation**: Identify potential causes using systematic approach
3. **Solution Development**: Provide multiple solution approaches with pros/cons
4. **Testing Strategy**: Define how to verify the fix works correctly
5. **Prevention Measures**: Suggest ways to prevent similar issues in the future

Provide a systematic debugging response including:
- Clear problem diagnosis
- Step-by-step debugging approach
- Multiple solution options with trade-offs
- Testing and validation steps
- Code examples with fixes
- Prevention strategies

Focus on practical, implementable solutions that address the root cause, not just symptoms.
`);

    const chain = RunnableSequence.from([
      debuggingPrompt,
      llm,
      new StringOutputParser(),
    ]);

    const context = relevantContext.map(doc => 
      `[${doc.metadata.fileName}]\n${doc.content}`
    ).join('\n\n');

    return await chain.invoke({
      context: context || "No specific code context available.",
      userMessage: userMessage
    });
  }
}

class ProjectManagementAgent extends BaseAgent {
  async process(userMessage, sessionId, session, model, apiKey) {
    const llm = await this.createLLM(model, apiKey);
    const relevantContext = await this.getRelevantContext(userMessage, sessionId);
    const projectStats = await this.langchainService.getProjectStats(sessionId);
    
    const projectPrompt = PromptTemplate.fromTemplate(`
You are a senior project manager and technical lead with expertise in software development lifecycle.

PROJECT OVERVIEW:
- Files processed: {filesCount}
- Documents in knowledge base: {docsCount}
- Last activity: {lastActivity}

PROJECT CONTEXT:
{context}

REQUEST:
{userMessage}

PROJECT MANAGEMENT FRAMEWORK:
1. **Requirements Analysis**: Understand and clarify project requirements
2. **Resource Assessment**: Evaluate available resources and constraints
3. **Planning & Strategy**: Develop actionable plans with realistic timelines
4. **Risk Management**: Identify potential risks and mitigation strategies
5. **Quality Assurance**: Define quality standards and success metrics

Provide a comprehensive project management response with:
- Clear understanding of requirements
- Realistic implementation timeline
- Resource and dependency analysis
- Risk assessment and mitigation
- Success metrics and milestones
- Next steps and action items

Balance technical excellence with practical constraints and business objectives.
`);

    const chain = RunnableSequence.from([
      projectPrompt,
      llm,
      new StringOutputParser(),
    ]);

    const context = relevantContext.map(doc => 
      `[${doc.metadata.fileName}]\n${doc.content}`
    ).join('\n\n');

    return await chain.invoke({
      context: context || "No specific project context available.",
      userMessage: userMessage,
      filesCount: projectStats.filesProcessed || 0,
      docsCount: projectStats.documentsCount || 0,
      lastActivity: projectStats.lastActivity || 'Just started'
    });
  }
}

class MultiAgentOrchestrator {
  constructor(langchainService) {
    this.langchainService = langchainService;
    this.agentSystem = new ClustrixAgentSystem(langchainService);
  }

  async processComplexRequest(userMessage, sessionId, session, model, apiKey) {
    const complexity = await this.assessComplexity(userMessage);
    
    if (complexity.isComplex) {
      return await this.orchestrateMultipleAgents(userMessage, sessionId, session, model, apiKey);
    } else {
      return await this.agentSystem.processWithAgent(userMessage, sessionId, session, model, apiKey);
    }
  }

  async assessComplexity(userMessage) {
    const message = userMessage.toLowerCase();
    const complexityIndicators = [
      'implement and test',
      'analyze and refactor',
      'research and implement',
      'debug and optimize',
      'create a complete',
      'full-stack',
      'end-to-end'
    ];

    const isComplex = complexityIndicators.some(indicator => message.includes(indicator));
    
    return {
      isComplex,
      estimatedAgents: isComplex ? ['research', 'code', 'project'] : ['single']
    };
  }

  async orchestrateMultipleAgents(userMessage, sessionId, session, model, apiKey) {
    return await this.agentSystem.agents.projectAgent.process(userMessage, sessionId, session, model, apiKey);
  }
}

module.exports = {
  ClustrixAgentSystem,
  MultiAgentOrchestrator,
  CodeAnalysisAgent,
  ResearchAgent,
  DebuggingAgent,
  ProjectManagementAgent
};
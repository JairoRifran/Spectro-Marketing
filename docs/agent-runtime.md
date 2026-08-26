# Agent runtime

`AgentProvider.run(context)` is provider-neutral. Context carries organization, agent, task, autonomy, and correlation data. Results contain structured output, learnings, and optional delegated task drafts.

M01 uses `MockProvider`. It performs deterministic work and demonstrates CMO → Market Intelligence delegation without simulating an LLM. Unsupported providers fail explicitly. The worker persists task and agent runs before execution and correlates structured logs.

Provider output is not authority. Code applies autonomy and approval rules. Add a provider by implementing the contract, mapping timeout/retryability to typed errors, and testing it without changing task semantics.

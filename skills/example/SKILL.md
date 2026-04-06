---
name: example
description: Example skill demonstrating the SKILL.md format. Use when learning how skills work.
user-invocable: true
allowed-tools:
  - Read
  - Bash(echo *)
---

# Example Skill

This is an example skill that demonstrates the SKILL.md format used by PlanCoDE.

Arguments passed: `$ARGUMENTS`

## What this skill does

1. Echoes the arguments back
2. Shows available tools
3. Demonstrates skill invocation

## Usage

Invoke with `/example <args>` or via the `load_skill` tool.

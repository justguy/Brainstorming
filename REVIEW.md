# Review instructions

This is a public-facing open-source project. In addition to standard correctness
and security review, the reviewer must screen contributions for content that
would embarrass the project or harm users if merged.

## Always flag as Important

- **Profanity, slurs, or hate speech** anywhere in the diff: code, comments,
  strings, identifiers, commit messages, test fixtures, sample data, docs, or
  filenames. Includes leetspeak, obfuscation, and non-English equivalents.
- **Harassment or doxxing**: real-person names paired with disparaging content,
  home addresses, phone numbers, or other PII targeting individuals.
- **Sexual, violent, or graphic content** in user-visible strings, default
  prompts, seed data, screenshots, or examples.
- **Discriminatory language or examples** that single out a protected class
  even in placeholder/example data (e.g. demo users, sample prompts).
- **Malicious code patterns**: backdoors, data exfiltration, hidden network
  calls, obfuscated payloads, or dependencies pulled from unverified sources.
- **Secrets**: API keys, tokens, passwords, private keys, `.env` contents, or
  internal URLs in any file — including tests and fixtures.
- **Prompt-injection vectors** in user-facing AI features: instructions that
  could override system prompts, hidden steering text, or jailbreak-style
  payloads in seed/example data.
- **Unsafe AI defaults**: changes that disable safety filters, lower content
  thresholds, or remove user-facing warnings without justification.

## Flag as Nit (style/maintainability)

- Tone in user-facing copy that is dismissive, sarcastic, or unprofessional.
- Placeholder text like `lorem ipsum`, `TODO`, `FIXME`, `xxx`, or
  `your-name-here` left in shipped strings.
- Inconsistent or low-effort naming (`stuff`, `temp2`, `data1`).

## Skip (do not report)

- Style/formatting nits already enforced by lint or prettier.
- Test-only code that violates production rules but is clearly scoped to tests.
- Generated files.

## Output format

- Lead the review with a one-line verdict: `OK to merge`, `Needs changes`, or
  `Block — policy violation`.
- If any Important content-policy item is found, the verdict must be
  `Block — policy violation` and call out the specific file and line.
- Cap nits at 5; group the rest under "plus N similar items."

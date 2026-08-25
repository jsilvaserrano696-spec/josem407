# Model selection policy

Reviewed against Google's official Gemini documentation on 2026-08-10.

## Production tiers

AXION exposes three explicit image-quality levels:

| AXION level | Gemini model | Output | Approximate standard image price |
|---|---|---:|---:|
| Economy (default) | `gemini-3.1-flash-lite-image` | 1K | USD 0.034 |
| Balanced | `gemini-3.1-flash-image` | 4K | USD 0.151 |
| Pro | `gemini-3-pro-image` | 4K | USD 0.240 |

Prices are rounded estimates from Google's published standard pricing and can
change. Text, input and thinking tokens may add cost.

Official sources:

- https://ai.google.dev/gemini-api/docs/image-generation
- https://ai.google.dev/gemini-api/docs/pricing

## Decision

Economy is the safe default for new and legacy settings. The user can raise the
level visibly for a final or especially demanding asset. AXION never silently
switches to a more expensive model.

The implementation follows these rules:

1. Only the three closed, tested tiers can select a model.
2. Work profiles may remember a chosen tier without storing project content or
   credentials.
3. Every generated version records its model ID and tier for auditability.
4. Failure does not trigger an automatic paid retry or model upgrade.
5. Automatic routing remains deferred; any future version must be opt-in,
   deterministic, explainable and separately validated.

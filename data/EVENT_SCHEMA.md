# Grow Simulator — EVENT_SCHEMA v2

Defines the target schema for `data/events.json` v2.

## Goals
- Deterministic event eligibility and selection
- Clear causal triggers
- Actionable player learning
- Stable runtime contract for UI + engine

---

## Top-level structure

```json
{
  "schemaVersion": 2,
  "events": [ ... ]
}
```

If a plain array is used, each object must still follow the event object schema below.

---

## Event object

```json
{
  "id": "string_unique",
  "category": "water|nutrition|pest|disease|environment|training|positive",
  "title": "short title",
  "description": "1-2 sentence player-facing context",

  "triggers": {
    "all": [
      { "field": "status.water", "op": "<=", "value": 30 },
      { "field": "simulation.isDaytime", "op": "==", "value": true }
    ],
    "any": [
      { "field": "status.stress", "op": ">=", "value": 65 }
    ],
    "stage": {
      "min": 3,
      "max": 8
    },
    "setup": {
      "modeIn": ["indoor", "greenhouse"],
      "mediumIn": ["soil", "coco"]
    }
  },

  "weight": 1.2, // optional, defaults to 1
  "pool": "warning", // optional, resolver infers when omitted
  "cooldownRealMinutes": 180,

  "options": [
    {
      "id": "option_id",
      "label": "player choice",
      "effects": { "water": 8, "stress": -2, "risk": -1 },
      "sideEffects": [
        {
          "id": "side_id",
          "when": "stress >= 60",
          "chance": 0.2,
          "effects": { "health": -2, "risk": 2 }
        }
      ],
      "followUps": ["event_followup_id"],
      "uiCopy": {
        "success": "Immediate player feedback",
        "warning": "Tradeoff warning"
      }
    }
  ],

  "learningNote": "Why it happened and how to prevent it next time."
}
```

---

## Trigger operators
Supported `op` values:
- `==`, `!=`
- `<`, `<=`, `>`, `>=`
- `in`, `not_in` (for arrays)

Evaluation model:
- `all` conditions are AND-combined
- `any` conditions are OR-combined
- event is eligible when all required trigger groups pass

---

## Required fields
Per event:
- `id`
- `category`
- `title`
- `description`
- `triggers`
- `cooldownRealMinutes`
- `options` (2-3 recommended)
- `learningNote`

- `weight` is optional. If omitted or invalid, resolver uses default weight `1`.
- `pool` is optional. If omitted, resolver infers pool from follow-up/category/tone/tags.

Per option:
- `id`
- `label`
- `effects`

---

## Determinism contract
- Event selection and side-effect rolls must use seeded PRNG context:
  - `seed`, `plantId`, `simTime/tick`, `eventId`, `optionId`
- No `Math.random()` in event evaluation or selection.

---

## Compatibility plan
- v1 events (severity/tags/choices) may be normalized into v2 internally during migration.
- New event authoring should target v2 only.

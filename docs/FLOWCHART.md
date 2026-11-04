# How Geopolitics works: flow charts

Built from `GAME_RULES.md` (§3, §4, §5, §8, §9) and `ARCHITECTURE.md` (§3, §4). If they disagree with this file, they win.

## 1. The whole game

```mermaid
flowchart TD
    A([Player opens the link]) --> B{Logged in?}
    B -- No --> W[Can watch only:<br/>board, battles, commentary<br/>polled every 2 s]
    B -- Yes --> C[Pick a real country]
    C --> D["Server sets up the game<br/>+9 random countries, NPC profiles,<br/>soldiers by population, map from capitals,<br/>random turn order"]
    D --> E{Whose turn?}
    E -- Human --> F[Human turn<br/>see chart 2]
    E -- NPC --> G["POST /npc-turn<br/>server plays the whole NPC turn<br/>see chart 3"]
    G --> H[Client replays the events<br/>normal speed or fast-forward]
    F --> I{Game over?}
    H --> I
    I -- No --> J[Next non-eliminated player.<br/>Wrap to first player: round + 1]
    J --> E
    I -- "Human owns all 10" --> K([Won])
    I -- "Human eliminated" --> L([Lost])
    W -. same events .-> H
```

## 2. The human's turn (one phase per request)

```mermaid
flowchart TD
    S([Turn starts]) --> R{Round 1?}
    R -- No --> RE["Reinforce<br/>place ALL soldiers:<br/>2 per country owned<br/>POST /reinforce"]
    R -- Yes --> M
    RE --> M[Manoeuvre]
    M --> T{Transfer?}
    T -- Yes --> TR["POST /transfer<br/>move soldiers between own countries<br/>repeat as often as wanted"]
    TR --> M
    T -- No --> AQ{Attack?}
    AQ -- "No: skip" --> END
    AQ -- Yes --> AS["POST /attack from → to<br/>must own from, have 2+ soldiers,<br/>target must be an enemy neighbour"]
    AS --> RO["POST /attack/roll<br/>SERVER rolls the dice<br/>compare pairs, losses applied"]
    RO --> O{Result}
    O -- "Target has 0 soldiers" --> OC["Occupy: POST /attack/occupy<br/>move in 1+ soldiers<br/>and place the conquest bonus"]
    O -- "Attacker down to 1" --> FL[Attack failed]
    O -- Still fighting --> P{Roll again?}
    P -- Roll --> RO
    P -- "POST /attack/stop" --> ST[Attack stopped]
    OC --> END
    FL --> END
    ST --> END
    END([Turn ends: one attack per turn at most])
```

Every action sends the `version` it last saw. A stale version gets a 409, so a double click cannot roll twice.

## 3. An NPC's turn (all inside one server request)

```mermaid
flowchart TD
    N([POST /npc-turn]) --> NR["Reinforce by profile<br/>Warlord and Opportunist: all to the biggest<br/>Fortress: one at a time to the smallest"]
    NR --> CAND["List candidates (s, t):<br/>own s with 2+ soldiers, t an enemy neighbour"]
    CAND --> SC[Score each candidate with the profile formula]
    SC --> EL{Any eligible and above the threshold?}
    EL -- No --> SK["Skip<br/>(event carries a reason)"]
    EL -- Yes --> BEST["Attack the best one<br/>ties: highest score, fewest defenders,<br/>then alphabetical"]
    BEST --> ROLL[Server rolls one round]
    ROLL --> CQ{Conquered?}
    CQ -- Yes --> OCC[Occupy by profile and place bonus]
    CQ -- No --> LEFT{"Attacker at 1?"}
    LEFT -- Yes --> DONE
    LEFT -- No --> STOP{"Profile says stop?<br/>or 20 rolls reached"}
    STOP -- Yes --> DONE
    STOP -- No --> ROLL
    OCC --> DONE
    SK --> DONE
    DONE["Save game + events in one transaction<br/>respond with every event in order"]
```

The LLM is never called here, so the request stays short.

## 4. A dice roll and its commentary

```mermaid
sequenceDiagram
    participant B as Browser
    participant S as Express server
    participant F as Firestore
    participant L as LLM (Anthropic)

    B->>S: POST /attack/roll { version } + ID token
    S->>S: requireAuth, validate body
    S->>F: transaction: read game
    S->>S: check owner, version, phase, turn
    S->>S: engine rolls with crypto.randomInt
    S->>F: write new state + events (atomic)
    S-->>B: 200 { game, events }
    B->>B: show dice and template line at once
    B->>S: POST /events/:id/commentary
    S->>L: structured event data only
    alt LLM answers in time
        L-->>S: one or two lines
    else timeout, error or cap reached
        S->>S: use the template text
    end
    S->>F: save aiText on the event
    S-->>B: { text }
    B->>B: swap in the commentary line
```

The LLM only writes words for an event the engine already produced. It decides nothing.

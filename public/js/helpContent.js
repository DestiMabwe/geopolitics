// The words in the two help dialogs (DESIGN §2 HelpDialog). Plain data: no DOM, nothing worked out here.
// The text restates GAME_RULES.md, which wins if they ever disagree. Section numbers are cited so a
// rule change shows where this copy needs to follow.

/** The pills, in header order. `id` is what helpSeen remembers and what data-action carries. */
export const HELP = {
  play: {
    id: 'play',
    pill: 'How to play',
    title: 'How to play',
    // GAME_RULES §4 (turn), §6 (transfers), §7 (reinforcements), §5 (attacking), §5.6 (occupy)
    steps: [
      {
        title: 'Your goal',
        text: 'You start with one real country. The server adds nine more, each run by an NPC. Conquer all ten to win.',
      },
      {
        title: 'Reinforce (from round 2)',
        text: 'At the start of your turn you get 2 soldiers for every country you own. Place all of them before doing anything else.',
      },
      {
        title: 'Transfer (optional)',
        text: 'Move soldiers between your own countries, as many times as you like. Each country keeps at least 1. You cannot transfer once an attack has started.',
      },
      {
        title: 'Attack',
        text: 'Pick one of your countries with 2 or more soldiers and an enemy country that borders it. You get one attack a turn. Roll again and again until you conquer it, you are down to 1 soldier, or you press Stop. You can also skip the attack.',
      },
      {
        title: 'Occupy',
        text: 'After a conquest, move at least 1 soldier into the new country and place your bonus soldiers on any country you own. Then your turn ends.',
      },
      {
        title: 'NPC turns',
        text: 'Then the NPCs play. Every move is replayed on screen with commentary. Fast-forward speeds the replay up but never hides a move.',
      },
    ],
  },

  win: {
    id: 'win',
    pill: 'How to win',
    title: 'How to win',
    // GAME_RULES §5.2, §5.3: dice per roll, pairs in the order rolled, ties kill nobody
    dice: {
      title: 'What the dice decide',
      points: [
        'Every roll, each side rolls one die for each soldier in the fight: the soldiers in your attacking country minus one, or the soldiers defending, whichever is fewer.',
        'Dice are paired in the order they were rolled. The higher die wins its pair, and the other side loses a soldier. A tie costs nobody anything.',
        'Only soldiers that are rolling can die. The rest stay safe at the back.',
      ],
      // The case-study roll from GAME_RULES §5.3 (10 v 2). Fixed illustration, not a live roll.
      example: {
        attackerSoldiers: 10,
        defenderSoldiers: 2,
        attackerDice: [1, 4],
        defenderDice: [2, 3],
        attackerLeft: 9,
        defenderLeft: 1,
        caption: '1 loses to 2, so the attacker loses a soldier. 4 beats 3, so the defender loses one.',
      },
    },
    // GAME_RULES §5.5 (conquest bonus), §7.2 (2 per country), §2.4 (elimination), §9.3 "How you get to all 10"
    snowball: {
      title: 'How conquering snowballs',
      points: [
        'Every conquest pays a bonus of at least 2 new soldiers, more for a bigger country. You place them on any country you own.',
        'Each turn you get 2 soldiers for every country you own, so one more country means 2 more soldiers every turn from then on.',
        'Taking a player’s last country removes them from the game for good.',
      ],
    },
    // GAME_RULES §9.1, §9.2
    goal: {
      title: 'The goal',
      text: 'You win when you own all 10 countries. You lose if you are eliminated.',
    },
    tip: 'Beginner tip: start with weak neighbours, the ones with few soldiers. Then put your extra soldiers on your big countries.',
  },
};

/** Header order. */
export const HELP_IDS = ['play', 'win'];

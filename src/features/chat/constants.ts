/**
 * Constants for the chat feature.
 */

/** MCP (Model Context Protocol) icon SVG. */
export const MCP_ICON_SVG = `<svg fill="currentColor" fill-rule="evenodd" height="1em" viewBox="0 0 24 24" width="1em" xmlns="http://www.w3.org/2000/svg"><title>MCP</title><path d="M15.688 2.343a2.588 2.588 0 00-3.61 0l-9.626 9.44a.863.863 0 01-1.203 0 .823.823 0 010-1.18l9.626-9.44a4.313 4.313 0 016.016 0 4.116 4.116 0 011.204 3.54 4.3 4.3 0 013.609 1.18l.05.05a4.115 4.115 0 010 5.9l-8.706 8.537a.274.274 0 000 .393l1.788 1.754a.823.823 0 010 1.18.863.863 0 01-1.203 0l-1.788-1.753a1.92 1.92 0 010-2.754l8.706-8.538a2.47 2.47 0 000-3.54l-.05-.049a2.588 2.588 0 00-3.607-.003l-7.172 7.034-.002.002-.098.097a.863.863 0 01-1.204 0 .823.823 0 010-1.18l7.273-7.133a2.47 2.47 0 00-.003-3.537z"></path><path d="M14.485 4.703a.823.823 0 000-1.18.863.863 0 00-1.204 0l-7.119 6.982a4.115 4.115 0 000 5.9 4.314 4.314 0 006.016 0l7.12-6.982a.823.823 0 000-1.18.863.863 0 00-1.204 0l-7.119 6.982a2.588 2.588 0 01-3.61 0 2.47 2.47 0 010-3.54l7.12-6.982z"></path></svg>`;

/** Check icon SVG for MCP selector. */
export const CHECK_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

/** ObsidianCode logo SVG configuration (GitHub Copilot style). */
export const LOGO_SVG = {
  viewBox: '0 0 24 24',
  width: '18',
  height: '18',
  path: 'M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2M7.5 13A2.5 2.5 0 0 0 5 15.5A2.5 2.5 0 0 0 7.5 18a2.5 2.5 0 0 0 2.5-2.5A2.5 2.5 0 0 0 7.5 13m9 0a2.5 2.5 0 0 0-2.5 2.5a2.5 2.5 0 0 0 2.5 2.5a2.5 2.5 0 0 0 2.5-2.5a2.5 2.5 0 0 0-2.5-2.5',
  fill: 'currentColor',
} as const;

/** Random flavor texts shown while Claude is thinking. */
export const FLAVOR_TEXTS = [
  // Classic
  'Thinking...',
  'Pondering...',
  'Processing...',
  'Analyzing...',
  'Considering...',
  'Working on it...',
  'One moment...',
  'On it...',
  // Thoughtful
  'Ruminating...',
  'Contemplating...',
  'Reflecting...',
  'Mulling it over...',
  'Let me think...',
  'Hmm...',
  'Cogitating...',
  'Deliberating...',
  'Weighing options...',
  'Gathering thoughts...',
  // Playful
  'Brewing ideas...',
  'Connecting dots...',
  'Assembling thoughts...',
  'Spinning up neurons...',
  'Loading brilliance...',
  'Consulting the oracle...',
  'Summoning knowledge...',
  'Crunching thoughts...',
  'Dusting off neurons...',
  'Wrangling ideas...',
  'Herding thoughts...',
  'Juggling concepts...',
  'Untangling this...',
  'Piecing it together...',
  // Cozy
  'Sipping coffee...',
  'Warming up...',
  'Getting cozy with this...',
  'Settling in...',
  'Making tea...',
  'Grabbing a snack...',
  // Technical
  'Parsing...',
  'Compiling thoughts...',
  'Running inference...',
  'Querying the void...',
  'Defragmenting brain...',
  'Allocating memory...',
  'Optimizing...',
  'Indexing...',
  'Syncing neurons...',
  // Zen
  'Breathing...',
  'Finding clarity...',
  'Channeling focus...',
  'Centering...',
  'Aligning chakras...',
  'Meditating on this...',
  // Whimsical
  'Asking the stars...',
  'Reading tea leaves...',
  'Shaking the magic 8-ball...',
  'Consulting ancient scrolls...',
  'Decoding the matrix...',
  'Communing with the ether...',
  'Peering into the abyss...',
  'Channeling the cosmos...',
  // Action
  'Diving in...',
  'Rolling up sleeves...',
  'Getting to work...',
  'Tackling this...',
  'On the case...',
  'Investigating...',
  'Exploring...',
  'Digging deeper...',
  // Casual
  'Bear with me...',
  'Hang tight...',
  'Just a sec...',
  'Working my magic...',
  'Almost there...',
  'Give me a moment...',
];

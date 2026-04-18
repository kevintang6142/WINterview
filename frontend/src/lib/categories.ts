export const ALL_CATEGORIES = [
  'Adaptability', 'Ambition', 'Analytical Thinking', 'Building Relationships',
  'Caution', 'Communication', 'Confidentiality', 'Conflict Resolution',
  'Customer Service', 'Decision Making', 'Delegation', 'Detail-Oriented',
  'Developing Others', 'Flexibility', 'Follow-up & Control', 'Influence',
  'Initiative', 'Innovation', 'Integrity', 'Leadership', 'Listening',
  'Motivation', 'Negotiation', 'Performance Management', 'Perseverance',
  'Personal Effectiveness', 'Planning & Organization', 'Problem Solving',
  'Removing Obstacles', 'Self-Assessment', 'Setting Goals', 'Teamwork',
  'Values Diversity',
] as const

export type Category = typeof ALL_CATEGORIES[number]

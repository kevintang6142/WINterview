export interface User {
  id: string
  name: string
  email: string
  picture?: string
  karma?: number
}

export interface Question {
  id: string
  text: string
  category?: string
  tags?: string[]
  response_count: number
  public_response_count: number
  avg_rating?: number | null
}

export interface MetricData {
  score: number
  feedback: string
}

export interface Evaluation {
  overall?: number
  word_count?: number
  words_per_minute?: number
  pacing_timeline?: number[]
  duration_seconds?: number
  filler_count?: number
  filler_words?: Record<string, number>
  structure_star?: MetricData
  specificity_depth?: MetricData
  delivery_pacing?: MetricData
  relevance?: MetricData
  reflection?: MetricData
  strengths?: string[]
  improvements?: string[]
  summary?: string
}

export interface ResponseItem {
  id: string
  question_text: string
  transcript_preview?: string
  transcript?: string
  avg_rating?: number | null
  rating_count?: number
  words_per_minute?: number
  filler_count?: number
  is_public?: boolean
  is_owner?: boolean
  my_rating?: number
  duration_seconds?: number
  overall_score?: number | null
  evaluation?: Evaluation
}

export interface Session {
  id: string
  questions: Question[]
}

export interface CategoryRating {
  structure_star: number
  specificity_depth: number
  delivery_pacing: number
  relevance: number
  reflection: number
}

export interface Comment {
  id: string
  user_id: string
  user_name: string
  user_picture?: string
  body: string
  created_at: string
  like_count: number
  dislike_count: number
  my_reaction: number
}

export type SortOrder = 'hot' | 'new' | 'top'
export type TimeRange = 'now' | 'today' | 'week' | 'month' | 'year' | 'all'
export type SessionMode = 'random' | 'selected'
export type SessionPhase =
  | 'loading'
  | 'playing'
  | 'idle'
  | 'recording'
  | 'transcribing'
  | 'evaluating'
  | 'saved'
  | 'countdown'
  | 'waiting-all'

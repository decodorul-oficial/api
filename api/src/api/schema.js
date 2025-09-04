/**
 * Schema GraphQL pentru API-ul Monitorul Oficial
 * Definește toate tipurile, query-urile și mutațiile disponibile
 */

export const typeDefs = `#graphql
  # Tipuri de bază
  type DailySynthesis {
    synthesisDate: String!
    title: String!
    content: String!
    summary: String
    metadata: JSON
  }
  type Stire {
    id: ID!
    title: String!
    publicationDate: String!
    content: JSON!
    topics: JSON
    entities: JSON
    createdAt: String!
    updatedAt: String
    filename: String
    viewCount: Int!
    predictedViews: Int
    category: String
  }

  type UserPreferences {
    preferredCategories: [String!]!
    notificationSettings: JSON!
    createdAt: String!
    updatedAt: String!
  }

  type Profile {
    id: ID!
    subscriptionTier: String!
    displayName: String
    avatarUrl: String
    preferences: UserPreferences
    createdAt: String!
    updatedAt: String
  }

  type User {
    id: ID!
    email: String!
    profile: Profile!
  }

  type AuthResponse {
    token: String!
    user: User!
  }

  type NewsletterSubscriber {
    id: ID
    email: String!
    status: String!
    locale: String
    tags: JSON
    source: String
    createdAt: String
    updatedAt: String
    subscribedAt: String
    unsubscribedAt: String
    unsubscribeReason: String
    metadata: JSON
  }

  type PaginationInfo {
    totalCount: Int!
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    currentPage: Int!
    totalPages: Int!
  }

  type StiriResponse {
    stiri: [Stire!]!
    pagination: PaginationInfo!
  }

  type MostReadResponse {
    stiri: [Stire!]!
  }

  type RelatedStory {
    id: ID!
    title: String!
    publicationDate: String!
    content: JSON!
    createdAt: String!
    filename: String
    viewCount: Int!
    category: String
    relevanceScore: Float!
    relevanceReasons: JSON
  }

  type RelatedStoriesResponse {
    relatedStories: [RelatedStory!]!
  }

  type CategoryCount {
    name: String!
    slug: String!
    count: Int!
  }

  # Tipuri pentru analiza de rețea a conexiunilor legislative
  type LegislativeNode {
    id: ID!
    title: String!
    publicationDate: String!
    type: String!
  }

  type LegislativeLink {
    source: ID!
    target: ID!
    type: String!
    confidence: Float!
  }

  type LegislativeGraph {
    nodes: [LegislativeNode!]!
    links: [LegislativeLink!]!
  }

  type LegislativeConnectionStats {
    totalConnections: Int!
    connectionsByType: JSON!
    topSourceDocuments: JSON!
    topTargetDocuments: JSON!
    averageConfidence: Float!
  }

  type RequestLog {
    id: ID!
    userId: ID!
    requestTimestamp: String!
  }

  type RequestHistoryResponse {
    requests: [RequestLog!]!
    totalCount: Int!
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
  }

  type RateLimitInfo {
    hasUnlimitedRequests: Boolean!
    requestLimit: Int
    currentRequests: Int!
    remainingRequests: Int
    tier: String!
    tierName: String!
  }

  # Analytics types
  type AnalyticsDataPoint {
    label: String!
    value: Int!
  }

  type TimeDataPoint {
    date: String!
    value: Int!
  }

  type AnalyticsDashboard {
    totalActs: Int!
    legislativeActivityOverTime: [TimeDataPoint!]!
    topActiveMinistries: [AnalyticsDataPoint!]!
    distributionByCategory: [AnalyticsDataPoint!]!
    topKeywords: [AnalyticsDataPoint!]!
    topMentionedLaws: [AnalyticsDataPoint!]!
  }

  # Input types pentru mutații
  input SignUpInput {
    email: String!
    password: String!
  }

  input SignInInput {
    email: String!
    password: String!
  }

  input CreateStireInput {
    title: String!
    publicationDate: String!
    content: JSON!
  }

  input UpdateStireInput {
    title: String
    publicationDate: String
    content: JSON
  }

  input UpdateProfileInput {
    subscriptionTier: String
    displayName: String
    avatarUrl: String
  }

  input UpdateUserPreferencesInput {
    preferredCategories: [String!]!
    notificationSettings: JSON
  }

  input SubscribeNewsletterInput {
    email: String!
    locale: String
    tags: [String!]
    source: String
    consentVersion: String
    metadata: JSON
  }

  input UnsubscribeNewsletterInput {
    email: String!
    reason: String
  }

  # Query-uri
  type Query {
    # Query-uri pentru știri
    getStiri(
      limit: Int
      offset: Int
      orderBy: String
      orderDirection: String
    ): StiriResponse!
    
    getStireById(id: ID!): Stire
    # Cele mai citite știri
    getMostReadStiri(period: String, limit: Int): MostReadResponse!
    # Căutare full-text/fuzzy în știri
    searchStiri(
      query: String!
      limit: Int
      offset: Int
      orderBy: String
      orderDirection: String
    ): StiriResponse!

    # Căutare după keywords din JSON-ul content.keywords cu suport pentru fuzzy/full-text search
    searchStiriByKeywords(
      query: String
      keywords: [String!]
      publicationDateFrom: String
      publicationDateTo: String
      limit: Int
      offset: Int
      orderBy: String
      orderDirection: String
    ): StiriResponse!

    # Pagina de categorie: listează știrile după content.category
    getStiriByCategory(
      category: String!
      limit: Int
      offset: Int
      orderBy: String
      orderDirection: String
    ): StiriResponse!

    # Analytics de bază
    topEntities(limit: Int): JSON!
    topTopics(limit: Int): JSON!
    getCategories(limit: Int): [CategoryCount!]!

    # Pagini de categorii (filtrare strictă pe slug)
    getStiriByCategorySlug(
      slug: String!
      limit: Int
      offset: Int
      orderBy: String
      orderDirection: String
    ): StiriResponse!

    # Query-uri pentru utilizatori
    me: User
    getUserProfile(userId: ID!): Profile
    getUserPreferences: UserPreferences!
    getPersonalizedFeed(
      limit: Int
      offset: Int
      orderBy: String
      orderDirection: String
    ): StiriResponse!

    # Query-uri pentru administrare
    getRequestHistory(
      userId: ID!
      limit: Int
      offset: Int
    ): RequestHistoryResponse!
    
    # Query pentru informații despre rate limiting
    getRateLimitInfo: RateLimitInfo!

    # Newsletter
    getNewsletterSubscription(email: String!): NewsletterSubscriber

    # Daily Syntheses
    getDailySynthesis(date: String!): DailySynthesis

    # Related Stories
    getRelatedStories(
      storyId: ID!
      limit: Int
      minScore: Float
    ): RelatedStoriesResponse!

    # Analytics Dashboard
    getAnalyticsDashboard(
      startDate: String!
      endDate: String!
    ): AnalyticsDashboard!

    # Analiza de rețea a conexiunilor legislative
    getLegislativeGraph(
      documentId: ID!
      depth: Int
    ): LegislativeGraph!

    # Statistici despre conexiunile legislative
    getLegislativeConnectionStats: LegislativeConnectionStats!
  }

  # Mutații
  type Mutation {
    # Mutații pentru autentificare
    signUp(input: SignUpInput!): AuthResponse!
    signIn(input: SignInInput!): AuthResponse!

    # Mutații pentru știri
    createStire(input: CreateStireInput!): Stire!
    updateStire(id: ID!, input: UpdateStireInput!): Stire!
    deleteStire(id: ID!): Boolean!

    # Mutații pentru profile
    updateProfile(input: UpdateProfileInput!): Profile!
    updateUserPreferences(input: UpdateUserPreferencesInput!): UserPreferences!

    # Newsletter
    subscribeNewsletter(input: SubscribeNewsletterInput!): NewsletterSubscriber!
    unsubscribeNewsletter(input: UnsubscribeNewsletterInput!): NewsletterSubscriber!
  }

  # Scalar pentru JSON
  scalar JSON
`;

export default typeDefs;

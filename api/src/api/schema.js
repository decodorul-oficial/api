/**
 * Schema GraphQL pentru API-ul Monitorul Oficial
 * Definește toate tipurile, query-urile și mutațiile disponibile
 */

export const typeDefs = `#graphql
  # Tipuri de bază
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
  }

  type Profile {
    id: ID!
    subscriptionTier: String!
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

    # Analytics de bază
    topEntities(limit: Int): JSON!
    topTopics(limit: Int): JSON!

    # Query-uri pentru utilizatori
    me: User
    getUserProfile(userId: ID!): Profile

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

    # Newsletter
    subscribeNewsletter(input: SubscribeNewsletterInput!): NewsletterSubscriber!
    unsubscribeNewsletter(input: UnsubscribeNewsletterInput!): NewsletterSubscriber!
  }

  # Scalar pentru JSON
  scalar JSON
`;

export default typeDefs;

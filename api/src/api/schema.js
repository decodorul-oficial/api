/**
 * Schema GraphQL pentru API-ul Monitorul Oficial
 * Definește toate tipurile, query-urile și mutațiile disponibile
 */

export const typeDefs = `#graphql
  # Tipuri de bază
  type DailySynthesis {
    id: ID!
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
    isFavorite: Boolean
  }

  type UserPreferences {
    preferredCategories: [String!]!
    notificationSettings: JSON!
    createdAt: String!
    updatedAt: String!
  }

  type Profile {
    id: ID
    subscriptionTier: String!
    displayName: String
    avatarUrl: String
    preferences: UserPreferences
    trialStatus: TrialStatus
    isNewsletterSubscribed: Boolean!
    isAdmin: Boolean!
    # Subscription information
    activeSubscription: Subscription
    subscriptionUsage: SubscriptionUsage
    paymentMethods: [PaymentMethod!]!
    subscriptionHistory: [Subscription!]!
    # Favorite news
    favoriteNews: [String!]!
    createdAt: String!
    updatedAt: String
  }

  type TrialStatus {
    isTrial: Boolean!
    hasTrial: Boolean!
    trialStart: String
    trialEnd: String
    tierId: String
    daysRemaining: Int
    expired: Boolean
  }

  type User {
    id: ID
    email: String
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

  # Conexiuni documente (view conexiuni_documente)
  type DocumentConnectionView {
    idConexiune: ID!
    idStireSursa: ID!
    cheieDocumentSursa: String
    idStireTinta: ID
    cheieDocumentTinta: String
    tipRelatie: String!
    confidenceScore: Float
    extractionMethod: String
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

  # Admin-only Stiri Stats
  input StiriStatsDayInput {
    day: String
  }

  input StiriStatsWeekInput {
    weekStart: String
  }

  input StiriStatsYearInput {
    year: Int
  }

  input StiriStatsMonthInput {
    year: Int
    month: Int
  }

  type StiriStatsSeriesPoint {
    label: String!
    value: Int!
  }

  type StiriStatsResponse {
    today: [StiriStatsSeriesPoint!]!
    thisWeek: [StiriStatsSeriesPoint!]!
    thisYear: [StiriStatsSeriesPoint!]!
    thisMonth: [StiriStatsSeriesPoint!]!
    total: Int!
    viewsToday: [StiriStatsSeriesPoint!]!
    viewsThisWeek: [StiriStatsSeriesPoint!]!
    viewsThisYear: [StiriStatsSeriesPoint!]!
    viewsThisMonth: [StiriStatsSeriesPoint!]!
    viewsTotal: Int!
  }

  # Input types pentru mutații
  input SignUpInput {
    email: String!
    password: String!
    recaptchaToken: String
  }

  input SignInInput {
    email: String!
    password: String!
    recaptchaToken: String
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

  input ChangePasswordInput {
    currentPassword: String!
    newPassword: String!
    recaptchaToken: String
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

  # Email Template Input Types
  input CreateEmailTemplateInput {
    templateName: String!
    subject: String!
    bodyHtml: String!
  }

  input UpdateEmailTemplateInput {
    templateName: String
    subject: String
    bodyHtml: String
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
    # Suportă sortare după: publicationDate, createdAt, title, id, viewCount
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

    # Admin-only Stiri Stats
    getStiriStats(
      day: StiriStatsDayInput
      week: StiriStatsWeekInput
      year: StiriStatsYearInput
      month: StiriStatsMonthInput
    ): StiriStatsResponse!

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

    # Conexiuni documente pentru o știre (cerere autenticată cu abonament/trial)
    getDocumentConnectionsByNews(
      newsId: ID!
      relationType: String
      limit: Int
      offset: Int
    ): [DocumentConnectionView!]!

    # Statistici pentru rezoluția conexiunilor externe
    getResolutionStats: JSON!
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

    # Rezolvare periodică: transformă referințele externe în ținte interne
    runExternalResolution(limit: Int): Int!
    runExternalResolutionRecent(days: Int, limit: Int): Int!

    # Mutații pentru profile
    updateProfile(input: UpdateProfileInput!): Profile!
    updateUserPreferences(input: UpdateUserPreferencesInput!): UserPreferences!
    changePassword(input: ChangePasswordInput!): Boolean!

    # Newsletter
    subscribeNewsletter(input: SubscribeNewsletterInput!): NewsletterSubscriber!
    unsubscribeNewsletter(input: UnsubscribeNewsletterInput!): NewsletterSubscriber!
  }

  # =====================================================
  # SUBSCRIPTION MANAGEMENT TYPES
  # =====================================================

  type SubscriptionTier {
    id: ID!
    name: String!
    displayName: String!
    description: String
    price: Float!
    currency: String!
    interval: SubscriptionInterval!
    features: [String!]!
    isPopular: Boolean
    trialDays: Int
    isActive: Boolean!
    createdAt: String!
    updatedAt: String!
  }

  enum SubscriptionInterval {
    MONTHLY
    YEARLY
    LIFETIME
  }

  type Subscription {
    id: ID!
    userId: ID!
    tier: SubscriptionTier!
    status: SubscriptionStatus!
    netopiaOrderId: String
    netopiaToken: String
    currentPeriodStart: String!
    currentPeriodEnd: String!
    cancelAtPeriodEnd: Boolean!
    canceledAt: String
    trialStart: String
    trialEnd: String
    metadata: JSON
    createdAt: String!
    updatedAt: String!
  }

  enum SubscriptionStatus {
    PENDING
    ACTIVE
    PAST_DUE
    CANCELED
    UNPAID
    TRIALING
    INCOMPLETE
    INCOMPLETE_EXPIRED
  }

  type PaymentMethod {
    id: ID!
    userId: ID!
    netopiaToken: String!
    last4: String!
    brand: String!
    expMonth: Int!
    expYear: Int!
    isDefault: Boolean!
    createdAt: String!
    updatedAt: String!
  }

  type Order {
    id: ID!
    userId: ID!
    subscriptionId: ID
    netopiaOrderId: String!
    amount: Float!
    currency: String!
    status: OrderStatus!
    checkoutUrl: String
    paymentMethodId: ID
    metadata: JSON
    createdAt: String!
    updatedAt: String!
  }

  enum OrderStatus {
    PENDING
    PROCESSING
    SUCCEEDED
    FAILED
    CANCELED
    REFUNDED
    PARTIALLY_REFUNDED
  }

  type Refund {
    id: ID!
    orderId: ID!
    netopiaRefundId: String
    amount: Float!
    currency: String!
    reason: RefundReason!
    status: RefundStatus!
    metadata: JSON
    createdAt: String!
    updatedAt: String!
  }

  enum RefundReason {
    DUPLICATE
    FRAUDULENT
    REQUESTED_BY_CUSTOMER
    ADMIN_REFUND
  }

  enum RefundStatus {
    PENDING
    SUCCEEDED
    FAILED
    CANCELED
  }

  type PaymentLog {
    id: ID!
    orderId: ID
    subscriptionId: ID
    eventType: PaymentEventType!
    netopiaOrderId: String
    amount: Float
    currency: String
    status: String
    rawPayload: JSON!
    processedAt: String!
    createdAt: String!
  }

  enum PaymentEventType {
    ORDER_CREATED
    PAYMENT_SUCCEEDED
    PAYMENT_FAILED
    SUBSCRIPTION_CREATED
    SUBSCRIPTION_UPDATED
    SUBSCRIPTION_CANCELED
    REFUND_CREATED
    REFUND_SUCCEEDED
    REFUND_FAILED
    WEBHOOK_RECEIVED
    WEBHOOK_PROCESSED
    WEBHOOK_FAILED
  }

  type CheckoutSession {
    orderId: ID!
    checkoutUrl: String!
    expiresAt: String!
  }

  type SubscriptionUsage {
    subscriptionId: ID!
    currentPeriodStart: String!
    currentPeriodEnd: String!
    requestsUsed: Int!
    requestsLimit: Int!
    requestsRemaining: Int!
    lastResetAt: String!
  }

  # =====================================================
  # INPUT TYPES
  # =====================================================

  input StartCheckoutInput {
    tierId: ID!
    paymentMethodId: ID
    trialDays: Int
    customerEmail: String
    customerPhone: String
    billingAddress: AddressInput
    shippingAddress: AddressInput
    metadata: JSON
  }

  input AddressInput {
    firstName: String
    lastName: String
    address: String
    city: String
    county: String
    country: String
    zipCode: String
    phone: String
  }

  input ReactivateSubscriptionInput {
    subscriptionId: ID!
    paymentMethodId: ID
  }

  input CancelSubscriptionInput {
    subscriptionId: ID!
    immediate: Boolean!
    refund: Boolean!
    reason: String
  }

  input AdminRefundInput {
    orderId: ID!
    amount: Float!
    reason: RefundReason!
    metadata: JSON
  }

  input UpdatePaymentMethodInput {
    paymentMethodId: ID!
    isDefault: Boolean
  }

  # =====================================================
  # SAVED SEARCHES INPUT TYPES
  # =====================================================

  input SaveSearchInput {
    name: String!
    description: String
    searchParams: JSON!
    isFavorite: Boolean
  }

  input UpdateSavedSearchInput {
    name: String
    description: String
    searchParams: JSON
    isFavorite: Boolean
  }

  # =====================================================
  # COMMENT INPUT TYPES
  # =====================================================

  input CreateCommentInput {
    content: String!
    parentType: CommentParentType!
    parentId: ID!
    recaptchaToken: String
  }

  input UpdateCommentInput {
    content: String!
  }

  # =====================================================
  # QUERIES
  # =====================================================

  extend type Query {
    # Subscription management
    getSubscriptionTiers: [SubscriptionTier!]!
    getMySubscription: Subscription
    getMyPaymentMethods: [PaymentMethod!]!
    getSubscriptionUsage: SubscriptionUsage
    
    # Order management
    getOrder(orderId: ID!): Order
    getMyOrders(limit: Int, offset: Int): [Order!]!
    
    # Admin queries
    getSubscription(subscriptionId: ID!): Subscription
    getOrderDetails(orderId: ID!): Order
    getPaymentLogs(
      orderId: ID
      subscriptionId: ID
      eventType: PaymentEventType
      limit: Int
      offset: Int
    ): [PaymentLog!]!
    getRefunds(orderId: ID, limit: Int, offset: Int): [Refund!]!
    
    # Monitoring & Admin Dashboard
    getPaymentMetrics(startDate: String, endDate: String): PaymentMetrics!
    getOrphanPayments(limit: Int, offset: Int): [PaymentLog!]!
    getWebhookStatus(webhookId: String): WebhookStatus

    # Cron Job Management (Admin Only)
    getCronJobStatus(jobName: String!): CronJobStatus!
    getAllCronJobsStatus: [CronJobStatus!]!
    getCronJobLogs(
      jobName: String
      startDate: String
      endDate: String
      status: CronJobStatusType
      limit: Int
      offset: Int
    ): CronJobLogsResponse!
    
    # =====================================================
    # SAVED SEARCHES QUERIES
    # =====================================================
    
    # Căutări salvate
    getSavedSearches(
      limit: Int
      offset: Int
      orderBy: String
      orderDirection: String
      favoritesOnly: Boolean
    ): SavedSearchResponse!
    
    getSavedSearchById(id: ID!): SavedSearch
    
    # =====================================================
    # EMAIL NOTIFICATION QUERIES
    # =====================================================
    
    # Email templates (admin only)
    getEmailTemplates: [EmailTemplate!]!
    getEmailTemplateById(id: ID!): EmailTemplate
    getEmailTemplateByName(templateName: String!): EmailTemplate
    
    # Email notification info for current user
    getEmailNotificationInfo: EmailNotificationInfo!
    getEmailNotificationStats(daysBack: Int): EmailNotificationStats!
    
    # =====================================================
    # COMMENT QUERIES
    # =====================================================
    
    getComments(
      parentType: CommentParentType!
      parentId: ID!
      limit: Int
      offset: Int
      orderBy: String
      orderDirection: String
    ): CommentsResponse!
    
    getCommentById(id: ID!): Comment
    
    # =====================================================
    # FAVORITE NEWS QUERIES
    # =====================================================
    
    getFavoriteNews(
      limit: Int
      offset: Int
      orderBy: String
      orderDirection: String
    ): FavoriteNewsResponse!
    
    isFavoriteNews(newsId: String!): Boolean!
    
    getFavoriteNewsStats: FavoriteNewsStats!

    # =====================================================
    # ADMIN USERS QUERIES
    # =====================================================
    
    adminUsers(
      page: Int = 1
      limit: Int = 10
      search: String
      sortField: AdminSortField
      sortDirection: AdminSortDirection = ASC
      filters: AdminUserFilters
    ): AdminUsersResponse!
    
    adminUserStats: AdminUserStats!
  }

  # =====================================================
  # CRON JOB MANAGEMENT TYPES
  # =====================================================

  type CronJobStatus {
    jobName: String!
    lastRun: String
    nextRun: String
    status: CronJobStatusType!
    lastRunDuration: Int
    lastRunError: String
    isEnabled: Boolean!
    metrics: CronJobMetrics!
  }

  enum CronJobStatusType {
    IDLE
    RUNNING
    FAILED
    DISABLED
  }

  type CronJobMetrics {
    totalRuns: Int!
    successfulRuns: Int!
    failedRuns: Int!
    averageRuntime: Float!
    lastRunMetrics: JSON
  }

  type CronJobLog {
    id: ID!
    jobName: String!
    startTime: String!
    endTime: String
    status: CronJobStatusType!
    duration: Int
    error: String
    metadata: JSON
    success: Boolean
    timestamp: String
    execution: CronJobExecution
    results: JSON
    errorDetails: CronJobErrorDetails
  }

  type CronJobExecution {
    status: String!
    message: String!
  }

  type CronJobErrorDetails {
    message: String
    name: String
    stack: String
    timestamp: String
  }

  type CronJobLogsResponse {
    logs: [CronJobLog!]!
    pagination: PaginationInfo!
  }

  type PaymentMetrics {
    totalEvents: Int!
    pendingPayments: Int!
    successfulPayments: Int!
    failedPayments: Int!
    webhookFailures: Int!
    retryQueue: Int!
    totalAmount: Float!
    averageProcessingTime: Float!
  }

  type WebhookStatus {
    webhookId: String!
    status: String!
    receivedAt: String!
    processedAt: String
    processingTimeMs: Int
    retryCount: Int!
    errorMessage: String
  }

  # =====================================================
  # SAVED SEARCHES TYPES
  # =====================================================

  type SavedSearch {
    id: ID!
    name: String!
    description: String
    searchParams: JSON!
    isFavorite: Boolean!
    emailNotificationsEnabled: Boolean!
    createdAt: String!
    updatedAt: String!
  }

  type SavedSearchResponse {
    savedSearches: [SavedSearch!]!
    pagination: PaginationInfo!
  }

  # =====================================================
  # EMAIL NOTIFICATION TYPES
  # =====================================================

  type EmailTemplate {
    id: ID!
    templateName: String!
    subject: String!
    bodyHtml: String!
    createdAt: String!
    updatedAt: String!
  }

  type EmailNotificationInfo {
    limit: Int!
    currentCount: Int!
    canEnableMore: Boolean!
    remaining: Int!
  }

  type EmailNotificationStats {
    totalNotifications: Int!
    totalSent: Int!
    totalFailed: Int!
    successRate: Float!
  }

  # =====================================================
  # COMMENT TYPES
  # =====================================================

  type Comment {
    id: ID!
    userId: ID
    user: User!
    content: String!
    parentType: CommentParentType!
    parentId: ID!
    isEdited: Boolean!
    editedAt: String
    createdAt: String!
    updatedAt: String!
    editHistory: [CommentEdit!]!
  }

  type CommentEdit {
    id: ID!
    previousContent: String!
    editedAt: String!
  }

  enum CommentParentType {
    STIRE
    SYNTHESIS
  }

  type CommentsResponse {
    comments: [Comment!]!
    pagination: PaginationInfo!
  }

  # =====================================================
  # FAVORITE NEWS TYPES
  # =====================================================

  type FavoriteNews {
    id: ID!
    userId: ID!
    newsId: String!
    createdAt: String!
    updatedAt: String!
    # News properties
    title: String!
    publicationDate: String!
    viewCount: Int!
    summary: String
  }

  type FavoriteNewsResponse {
    favoriteNews: [FavoriteNews!]!
    pagination: PaginationInfo!
  }

  type ToggleFavoriteNewsResponse {
    action: String!
    isFavorite: Boolean!
    message: String!
    favoriteNews: FavoriteNews
  }

  type FavoriteNewsStats {
    totalFavorites: Int!
    latestFavoriteDate: String
  }

  # =====================================================
  # ADMIN USERS MANAGEMENT TYPES
  # =====================================================

  type AdminUser {
    id: ID!
    name: String!
    email: String!
    avatar: String
    createdAt: DateTime!
    lastLoginAt: DateTime
    isActive: Boolean!
    isAdmin: Boolean!
    statusLabel: String!
    subscription: AdminSubscription
    favoriteNews: [AdminFavoriteNews!]!
    savedSearches: [AdminSavedSearch!]!
    preferences: AdminUserPreferences!
    paymentHistory: [AdminPayment!]!
  }

  type AdminSubscription {
    id: ID!
    type: AdminSubscriptionType!
    status: AdminSubscriptionStatus!
    startDate: DateTime!
    endDate: DateTime!
    autoRenew: Boolean!
    price: Float!
    currency: String!
    typeLabel: String!
    statusLabel: String!
  }

  type AdminFavoriteNews {
    id: ID!
    title: String!
    url: String!
    addedAt: DateTime!
    category: String!
  }

  type AdminSavedSearch {
    id: ID!
    query: String!
    filters: AdminSearchFilters!
    createdAt: DateTime!
    lastUsed: DateTime!
  }

  type AdminSearchFilters {
    categories: [String!]
    dateRange: AdminDateRange
  }

  type AdminDateRange {
    start: DateTime!
    end: DateTime!
  }

  type AdminUserPreferences {
    categories: [String!]!
    notifications: AdminNotificationSettings!
    language: String!
    theme: AdminTheme!
  }

  type AdminNotificationSettings {
    email: Boolean!
    push: Boolean!
    newsletter: Boolean!
  }

  type AdminPayment {
    id: ID!
    amount: Float!
    currency: String!
    status: AdminPaymentStatus!
    method: AdminPaymentMethod!
    transactionId: String!
    createdAt: DateTime!
    description: String!
    statusLabel: String!
    methodLabel: String!
  }

  type AdminUsersResponse {
    users: [AdminUser!]!
    pagination: AdminPaginationInfo!
  }

  type AdminPaginationInfo {
    totalCount: Int!
    totalPages: Int!
    currentPage: Int!
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
  }

  type AdminUserStats {
    totalUsers: Int!
    activeUsers: Int!
    freeUsers: Int!
    proUsers: Int!
    enterpriseUsers: Int!
  }

  type AdminActionResult {
    success: Boolean!
    message: String!
  }

  # Admin Enums
  enum AdminSubscriptionType {
    FREE
    PRO_MONTHLY    # Mapat din 'pro' din baza de date
    PRO_YEARLY
    ENTERPRISE_MONTHLY  # Mapat din 'enterprise' din baza de date
    ENTERPRISE_YEARLY
  }

  enum AdminSubscriptionStatus {
    ACTIVE
    CANCELED
    EXPIRED
    PENDING
    TRIALING
    PAST_DUE
    UNPAID
    INCOMPLETE
    INCOMPLETE_EXPIRED
  }

  enum AdminPaymentStatus {
    SUCCESS
    FAILED
    PENDING
    REFUNDED
  }

  enum AdminPaymentMethod {
    CARD
    PAYPAL
    BANK_TRANSFER
  }

  enum AdminTheme {
    LIGHT
    DARK
    AUTO
  }

  enum AdminSortField {
    NAME
    EMAIL
    CREATED_AT
    LAST_LOGIN_AT
    IS_ACTIVE
    SUBSCRIPTION_TYPE
    SUBSCRIPTION_STATUS
  }

  enum AdminSortDirection {
    ASC
    DESC
  }

  # Admin Input Types
  input AdminUserFilters {
    status: AdminUserStatusFilter
    subscriptionType: AdminSubscriptionTypeFilter
    subscriptionStatus: AdminSubscriptionStatusFilter
    isAdmin: AdminAdminStatusFilter
  }

  input AdminUserStatusFilter {
    eq: Boolean
  }

  input AdminSubscriptionTypeFilter {
    eq: AdminSubscriptionType
  }

  input AdminSubscriptionStatusFilter {
    eq: AdminSubscriptionStatus
  }

  input AdminAdminStatusFilter {
    eq: Boolean
  }

  # =====================================================
  # MUTATIONS
  # =====================================================

  extend type Mutation {
    # Checkout and payment
    startCheckout(input: StartCheckoutInput!): CheckoutSession!
    confirmPayment(orderId: ID!): Order!
    
    # Subscription management
    reactivateSubscription(input: ReactivateSubscriptionInput!): Subscription!
    cancelSubscription(input: CancelSubscriptionInput!): Subscription!
    updatePaymentMethod(input: UpdatePaymentMethodInput!): PaymentMethod!
    
    # Admin operations
    adminRefund(input: AdminRefundInput!): Refund!
    adminCancelSubscription(subscriptionId: ID!, reason: String): Subscription!

    # Cron Job Management (Admin Only)
    runCronJob(jobName: String!): CronJobStatus!
    enableCronJob(jobName: String!): CronJobStatus!
    disableCronJob(jobName: String!): CronJobStatus!
    clearCronJobLogs(
      jobName: String
      olderThan: String
      status: CronJobStatusType
    ): Boolean!
    
    # Webhook handling (internal)
    webhookNetopiaIPN(payload: JSON!): Boolean!
    
    # =====================================================
    # SAVED SEARCHES MUTATIONS
    # =====================================================
    
    # Căutări salvate
    saveSearch(input: SaveSearchInput!): SavedSearch!
    updateSavedSearch(id: ID!, input: UpdateSavedSearchInput!): SavedSearch!
    deleteSavedSearch(id: ID!): Boolean!
    toggleFavoriteSearch(id: ID!): SavedSearch!
    toggleEmailNotifications(id: ID!, enabled: Boolean!): SavedSearch!
    
    # =====================================================
    # EMAIL TEMPLATE MUTATIONS (ADMIN ONLY)
    # =====================================================
    
    createEmailTemplate(input: CreateEmailTemplateInput!): EmailTemplate!
    updateEmailTemplate(id: ID!, input: UpdateEmailTemplateInput!): EmailTemplate!
    deleteEmailTemplate(id: ID!): Boolean!
    
    # =====================================================
    # COMMENT MUTATIONS
    # =====================================================
    
    createComment(input: CreateCommentInput!): Comment!
    updateComment(id: ID!, input: UpdateCommentInput!): Comment!
    deleteComment(id: ID!): Boolean!
    
    # =====================================================
    # FAVORITE NEWS MUTATIONS
    # =====================================================
    
    addFavoriteNews(newsId: String!): FavoriteNews!
    removeFavoriteNews(newsId: String!): Boolean!
    toggleFavoriteNews(newsId: String!): ToggleFavoriteNewsResponse!
    clearAllFavoriteNews: Boolean!

    # =====================================================
    # ADMIN USERS MUTATIONS
    # =====================================================
    
    adminUsersCancelSubscription(userId: ID!, subscriptionId: ID!): AdminActionResult!
    adminUsersReactivateSubscription(userId: ID!, subscriptionId: ID!): AdminActionResult!
    adminUsersSuspendUser(userId: ID!): AdminActionResult!
    adminUsersActivateUser(userId: ID!): AdminActionResult!
    adminUsersDeleteUser(userId: ID!): AdminActionResult!
    adminUsersPromoteToAdmin(userId: ID!): AdminActionResult!
    adminUsersDemoteFromAdmin(userId: ID!): AdminActionResult!
  }

  # Scalars
  scalar JSON
  scalar DateTime
`;

export default typeDefs;

# Changelog

All notable changes to the Monitorul Oficial API will be documented in this file.

## [1.1.0] - 2024-01-XX

### Added
- **Subscription-based content limits** for stories pagination
- Stories pagination limits based on subscription status:
  - Free users: maximum 10 stories per page
  - Trial users: up to 100 stories per page (trial grants full pagination benefits)
  - Paid subscribers: up to 100 stories per page
- Trial users now have full pagination access (same as paid subscribers)
- Enhanced error handling with subscription and trial validation
- Clear error messages in Romanian for subscription requirements
- Updated documentation for content access control

### Changed
- Updated GraphQL resolvers to validate subscription and trial status for high limits
- Enhanced error responses with proper GraphQL error codes
- Updated subscription tier descriptions to include pagination limits
- Trial users now have the same pagination benefits as paid subscribers

### Technical Details
- Added subscription and trial validation logic to the following resolvers:
  - `getStiri`
  - `searchStiri`
  - `searchStiriByKeywords`
  - `getStiriByCategory`
  - `getStiriByCategorySlug`
- Created `hasHighLimitAccess()` helper function for subscription and trial validation
- Trial users now have the same pagination benefits as paid subscribers
- Implemented proper error handling with `UNAUTHENTICATED` and `SUBSCRIPTION_REQUIRED` codes
- Added comprehensive documentation in multiple formats

### Documentation
- Updated `API_CONSUMPTION_GUIDE.md` with pagination limits section
- Updated `SUBSCRIPTION_SYSTEM.md` with content access control details
- Created `SUBSCRIPTION_CONTENT_LIMITS.md` with comprehensive implementation guide
- Updated `README.md` to highlight new subscription-based features

### Breaking Changes
- None - this is a backward-compatible enhancement

### Migration Notes
- No database migrations required
- No environment variable changes required
- Existing API contracts remain unchanged for limits ≤ 10

## [1.0.0] - 2024-01-XX

### Initial Release
- Complete GraphQL API implementation
- Supabase integration
- Authentication and authorization
- Rate limiting system
- Subscription management
- Payment processing with Netopia
- Comprehensive documentation
- Security features
- Audit logging
- Trial system

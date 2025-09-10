---
name: appwechat
description: StorySpark AI toy companion WeChat mini-program for device pairing, story control, and parental settings
status: backlog
created: 2025-09-10T09:05:55Z
---

# PRD: StorySpark WeChat Mini-Program Interface

## Executive Summary

StorySpark is an educational AI toy companion for children aged 4-7 that tells interactive, choice-based stories to enhance creativity and listening skills. This PRD outlines the development of a WeChat mini-program that serves as the primary parental control interface for the StorySpark toy, enabling device pairing, story selection, and basic settings management while maintaining strict privacy compliance by avoiding storage of sensitive user data.

## Problem Statement

**What problem are we solving?**
Parents need a simple, secure way to control and interact with their child's AI toy without the complexity of app store downloads or account creation. Current smart toy solutions often require extensive personal data collection and complex setup processes that create barriers to adoption and privacy concerns.

**Why is this important now?**
- Growing concern about children's digital privacy (COPPA/GDPR compliance)
- Parents want immediate, frictionless control over their child's smart toy experience
- WeChat's ubiquitous presence in our target market eliminates installation friction
- Need to validate core functionality before full product launch

## User Stories

### Primary User Persona: Tech-Savvy Parent (Ages 28-40)
- Has children aged 4-7
- Active WeChat user
- Concerned about digital privacy for children
- Wants educational content for their child
- Values convenience and ease of use

### User Journeys

**First-Time Setup Journey**
1. Parent opens StorySpark WeChat mini-program
2. Grants WeChat login authorization
3. Completes brief onboarding (2-3 screens explaining toy pairing)
4. Scans QR code on StorySpark toy packaging/tag
5. Mini-program establishes Bluetooth connection with toy
6. Parent sees main dashboard with story selection

**Daily Use Journey**
1. Parent opens mini-program (auto-login via WeChat)
2. Selects story theme from available options
3. Taps "Send to Toy" button
4. Child's toy begins playing selected story
5. Parent can adjust volume or activate bedtime mode as needed

**Pain Points Addressed**
- No app store downloads required (WeChat mini-program)
- No personal data collection from children
- One-tap story selection and toy control
- Immediate toy response and feedback

## Requirements

### Functional Requirements

**Core Features**
- **WeChat OAuth Integration**
  - WeChat login authorization flow
  - Secure openid retrieval and storage
  - Session management and auto-login

- **Device Pairing System**
  - QR code scanning functionality
  - Bluetooth Low Energy (BLE) device discovery
  - Secure pairing with unique device identifier
  - One-toy-per-account limitation enforcement

- **Story Content Management**
  - Pre-loaded story library display (minimum 10 themes)
  - Story theme categories: "Space Adventure," "Forest Friends," "Ocean Tales," etc.
  - Story selection and transmission to toy via BLE
  - Real-time confirmation of successful story deployment

- **Basic Settings Control**
  - Volume adjustment (5 levels: Very Quiet, Quiet, Normal, Loud, Very Loud)
  - Bedtime Mode toggle (reduces volume, shorter stories)
  - Settings synchronization with physical toy

**User Interface Requirements**
- Clean, intuitive design suitable for parents
- Large, accessible buttons for easy interaction
- Visual feedback for all actions
- Error states with clear recovery instructions
- Loading states for BLE operations

### Non-Functional Requirements

**Performance**
- Mini-program launch time < 3 seconds
- BLE pairing completion < 30 seconds
- Story transmission to toy < 10 seconds
- Volume/setting changes reflected on toy < 2 seconds

**Security & Privacy**
- Zero storage of children's personal information
- Minimal data retention (only openid + device_id mapping)
- Secure BLE communication with encryption
- COPPA/GDPR compliant data handling

**Reliability**
- 99% uptime for backend services
- Graceful handling of BLE connection failures
- Offline mode for basic toy interaction (if paired)
- Auto-reconnection attempts for dropped BLE connections

**Scalability**
- Support for 10,000+ concurrent users at launch
- Backend architecture ready for story library expansion
- Mini-program performance optimized for various WeChat versions

## Success Criteria

### Primary Metrics (MVP Validation)
- **WeChat Login Success Rate**: >95% of users successfully complete authorization
- **Device Pairing Success Rate**: >90% of QR scans result in successful BLE pairing
- **Story Transmission Success Rate**: >95% of story selections successfully reach the toy
- **Setting Control Success Rate**: >98% of volume/bedtime mode changes apply correctly

### User Experience Metrics
- **Time to First Story**: <3 minutes from mini-program launch to toy playing story
- **User Completion Rate**: >85% of users complete full onboarding flow
- **Return Usage Rate**: >60% of users return within 7 days

### Technical Performance Metrics
- **Mini-program Load Time**: <3 seconds on average
- **BLE Connection Stability**: <5% disconnection rate during active sessions

## Constraints & Assumptions

### Technical Constraints
- WeChat mini-program platform limitations and API restrictions
- BLE communication range (typically 10-30 meters)
- Device compatibility limited to BLE-capable smartphones
- WeChat version compatibility requirements

### Business Constraints
- MVP budget and timeline limitations
- No WeChat Pay integration in initial version
- Single toy per account limitation
- Story library limited to pre-loaded content (no dynamic downloads)

### Regulatory Constraints
- COPPA compliance: No data collection from children under 13
- GDPR compliance: Minimal data retention and clear consent
- WeChat platform compliance: Adherence to mini-program guidelines

### Assumptions
- Target users are active WeChat users with BLE-capable devices
- Parents are the primary operators (not children)
- StorySpark toy hardware supports required BLE communication protocols
- Backend infrastructure will be cloud-hosted (AWS/Google Cloud)

## Out of Scope

### Features Explicitly NOT Included in MVP
- **Multiple Toy Support**: Users cannot pair multiple toys to one account
- **WeChat Pay Integration**: No payment processing for additional content
- **Social Features**: No story sharing or friend interactions
- **Custom Story Creation**: No user-generated content tools
- **Advanced Analytics**: No detailed usage reporting or insights
- **Native iOS/Android Apps**: Only WeChat mini-program development
- **Voice Commands**: No voice-to-text or voice control features
- **Parental Dashboards**: No web-based management interface
- **Story History**: No tracking of previously played stories
- **Time Limits/Schedules**: No automated playtime restrictions

### Future Considerations (V2+)
- Premium story pack purchases
- Multi-device household support
- Story sharing capabilities
- Advanced parental controls and usage analytics

## Dependencies

### External Dependencies
- **WeChat Platform**: Mini-program approval and deployment
- **StorySpark Hardware Team**: Final BLE protocol specifications and toy firmware
- **Backend Infrastructure**: Cloud hosting setup (AWS/Google Cloud)
- **Content Team**: Story library creation and audio production

### Internal Team Dependencies
- **Frontend Development**: WeChat mini-program development expertise
- **Backend Development**: API development and database design
- **QA Team**: BLE testing capabilities and device compatibility testing
- **Legal/Compliance**: COPPA/GDPR compliance validation

### Third-Party Dependencies
- WeChat Developer Tools and SDK
- BLE communication libraries for mini-programs
- Cloud hosting provider APIs
- SSL certificate management

## Risk Mitigation

### Technical Risks
- **BLE Connectivity Issues**: Implement retry logic and clear error messaging
- **WeChat API Changes**: Monitor WeChat developer updates and maintain compatibility
- **Device Compatibility**: Extensive testing across popular smartphone models

### Business Risks
- **Regulatory Compliance**: Legal review before launch and ongoing compliance monitoring
- **User Adoption**: User testing and feedback integration during development
- **Competition**: Focus on unique value proposition (privacy-first, seamless experience)

## Implementation Timeline

### Phase 1: Foundation (Weeks 1-4)
- WeChat mini-program project setup
- Backend API architecture design
- Basic UI wireframes and design system

### Phase 2: Core Development (Weeks 5-10)
- WeChat OAuth integration
- QR code scanning and BLE pairing
- Story selection and transmission functionality

### Phase 3: Polish & Testing (Weeks 11-14)
- Settings control implementation
- Error handling and edge cases
- Comprehensive testing across devices
- Performance optimization

### Phase 4: Launch Preparation (Weeks 15-16)
- WeChat mini-program submission and approval
- Production deployment
- Launch monitoring and support preparation

## Acceptance Criteria

### MVP Complete When:
1. **End-to-End User Flow**: New user can complete entire journey from WeChat login to toy playing story
2. **Core Functionality Verified**: All primary features (login, pairing, story selection, settings) work reliably
3. **Performance Benchmarks Met**: All success criteria metrics achieved in testing
4. **Compliance Validated**: Legal approval for COPPA/GDPR compliance
5. **WeChat Approval Obtained**: Mini-program approved and published by WeChat
6. **Production Ready**: Backend deployed with monitoring and support processes in place

The MVP will be considered successful when parents can seamlessly control their child's StorySpark toy through the WeChat mini-program without friction, privacy concerns, or technical barriers.
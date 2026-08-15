# eSMS SMS Provider Design Addendum

## Scope

Add eSMS as a second production delivery adapter behind the existing `SmsProvider` interface. The Phone Auth service remains responsible for OTP generation, HMAC persistence, TTL, attempts, replay protection, rate limits, browser binding, account resolution and JWT creation.

## Chosen Approach

Use provider-specific nested configuration selected by `OTP_SMS_PROVIDER`. This keeps Twilio and eSMS credentials independent, makes partial selected-provider configuration fail closed, and avoids requiring credentials for an unused provider. A flat shared credential bag was rejected because it makes cross-provider validation ambiguous; a provider-neutral generic HTTP adapter was rejected because the vendors have materially different authentication, payload and response semantics.

## eSMS Delivery

`EsmsSmsProvider` sends one JSON POST to the fixed endpoint `https://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_post_json/`. It converts a canonical Vietnamese E.164 number such as `+84912345678` to `0912345678`, preserves the backend OTP as a string, and uses the exact approved content `${code} la ma xac minh dang ky Baotrixemay cua ban` with `Brandname="Baotrixemay"`, `SmsType="2"` and `IsUnicode="0"`. It omits `Sandbox` and `AutoGenCode`.

Non-Vietnamese E.164 input is rejected as a sanitized delivery failure because this adapter is configured for the official Vietnamese test brand/template. Twilio retains its existing international behavior.

## Response and Failure Semantics

HTTP 2xx is necessary but not sufficient. The adapter parses a physical JSON contract and treats only string `CodeResult="100"` as accepted delivery. HTTP errors, network errors, timeout, malformed JSON, invalid schema and any other result are mapped to `OtpDeliveryUnavailableError`. There is no blind retry after an ambiguous provider result.

No request body, OTP, credentials, provider response, SMS identifier or secret is logged or included in thrown public errors. The fixed endpoint is not environment-configurable.

## Contracts and Testing

Add `esms_send_response` JSON Schema, a synthetic success example, a matching TypeScript type and runtime validator. Tests cover factory selection, fail-closed credentials, exact request construction, Vietnamese phone conversion, leading-zero OTP preservation, success-code validation, safe failure mapping, timeout, absence of logs and regression gates for Twilio and the existing auth lifecycle.

## Live-Test Boundary

Automated tests use synthetic credentials and mocked HTTP only. This milestone does not send a live SMS. After all gates pass, the only requested local provider switch is `OTP_SMS_PROVIDER=esms`; the user restarts the backend and performs the handset test separately.

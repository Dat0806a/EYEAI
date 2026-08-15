import { readFileSync, readdirSync } from 'fs';
import { basename, join } from 'path';
import { existsSync } from 'fs';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { oauthExchangeSchema } from '../src/schemas';

interface ContractEntry {
  id: string;
  schema: string;
  example: string;
}

describe('JSON contract validation', () => {
  const contractsDir = join(__dirname, '..', '..', 'contracts');
  const schemasDir = join(contractsDir, 'json');
  const examplesDir = join(contractsDir, 'examples');
  const schemaBaseUri = 'https://contracts.yte.local/json/';

  const manifest = JSON.parse(readFileSync(join(contractsDir, 'manifest.json'), 'utf8')) as { contracts: ContractEntry[] };
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  const schemaFiles = readdirSync(schemasDir).filter((file) => file.endsWith('.schema.json'));
  for (const schemaFile of schemaFiles) {
    const schemaObj = JSON.parse(readFileSync(join(schemasDir, schemaFile), 'utf8'));
    ajv.addSchema(schemaObj, `${schemaBaseUri}${schemaFile}`);
  }

  it.each<ContractEntry>(manifest.contracts)('$id example validates against schema', (entry) => {
    const { id, schema, example } = entry;
    const exampleObj = JSON.parse(readFileSync(join(contractsDir, example), 'utf8'));
    const validate = ajv.getSchema(`${schemaBaseUri}${basename(schema)}`);
    expect(validate).toBeDefined();
    if (!validate) return;
    const valid = validate(exampleObj);
    expect(valid).toBe(true);
    if (!valid) {
      throw new Error(ajv.errorsText(validate.errors, { separator: '\n' }));
    }
  });

  it('every schema has an example and every example has a schema', () => {
    const exampleFiles = readdirSync(examplesDir).filter((f) => f.endsWith('.example.json'));
    const contractIds = manifest.contracts.map((contract) => contract.id);
    expect(schemaFiles.length).toBeGreaterThan(0);
    expect(exampleFiles.length).toBe(schemaFiles.length);
    expect(new Set(contractIds).size).toBe(contractIds.length);
    expect(manifest.contracts.map((contract) => contract.schema).sort()).toEqual(
      schemaFiles.map((file) => `json/${file}`).sort(),
    );
    expect(manifest.contracts.map((contract) => contract.example).sort()).toEqual(
      exampleFiles.map((file) => `examples/${file}`).sort(),
    );
  });

  it('registers a physical eSMS send-response contract with a synthetic example', () => {
    expect(manifest.contracts).toContainEqual({
      id: 'esms_send_response',
      schema: 'json/esms_send_response.schema.json',
      example: 'examples/esms_send_response.example.json',
    });
    expect(existsSync(join(schemasDir, 'esms_send_response.schema.json'))).toBe(true);
    expect(existsSync(join(examplesDir, 'esms_send_response.example.json'))).toBe(true);

    const schema = JSON.parse(
      readFileSync(join(schemasDir, 'esms_send_response.schema.json'), 'utf8'),
    );
    expect(schema).toMatchObject({
      type: 'object',
      additionalProperties: true,
      required: ['CodeResult'],
      properties: {
        CodeResult: { type: 'string', minLength: 1 },
        CountRegenerate: { type: 'integer', minimum: 0 },
        SMSID: { type: 'string' },
        ErrorMessage: { type: 'string' },
      },
    });

    const validate = ajv.getSchema(`${schemaBaseUri}esms_send_response.schema.json`);
    expect(validate).toBeDefined();
    if (!validate) return;
    expect(validate({ CodeResult: '100', FutureProviderField: 'allowed' })).toBe(true);
    expect(validate({ CodeResult: 100 })).toBe(false);
    expect(validate({ SMSID: 'missing-code-result' })).toBe(false);
  });

  it('registers physical history-list and report-detail contracts with examples', () => {
    expect(manifest.contracts).toEqual(expect.arrayContaining([
      {
        id: 'history_list',
        schema: 'json/history_list.schema.json',
        example: 'examples/history_list.example.json',
      },
      {
        id: 'report_detail',
        schema: 'json/report_detail.schema.json',
        example: 'examples/report_detail.example.json',
      },
    ]));
    for (const relativePath of [
      'json/history_list.schema.json',
      'examples/history_list.example.json',
      'json/report_detail.schema.json',
      'examples/report_detail.example.json',
    ]) {
      expect(existsSync(join(contractsDir, relativePath))).toBe(true);
    }
  });

  it('does not register or retain the obsolete Gemini lab-analysis draft contract', () => {
    expect(manifest.contracts.some((contract) => contract.id === 'gemini_lab_analysis_draft')).toBe(false);
    expect(existsSync(join(contractsDir, 'json/gemini_lab_analysis_draft.schema.json'))).toBe(false);
    expect(existsSync(join(contractsDir, 'examples/gemini_lab_analysis_draft.example.json'))).toBe(false);
  });

  it('registers strict OAuth session and authorization contracts with safe synthetic examples', () => {
    const expectedContracts = [
      {
        id: 'oauth_session',
        schema: 'json/oauth_session.schema.json',
        example: 'examples/oauth_session.example.json',
      },
      {
        id: 'oauth_authorization',
        schema: 'json/oauth_authorization.schema.json',
        example: 'examples/oauth_authorization.example.json',
      },
    ];
    expect(manifest.contracts).toEqual(expect.arrayContaining(expectedContracts));

    const sessionSchema = JSON.parse(
      readFileSync(join(schemasDir, 'oauth_session.schema.json'), 'utf8'),
    );
    const authorizationSchema = JSON.parse(
      readFileSync(join(schemasDir, 'oauth_authorization.schema.json'), 'utf8'),
    );
    const sessionExample = JSON.parse(
      readFileSync(join(examplesDir, 'oauth_session.example.json'), 'utf8'),
    );
    const authorizationExample = JSON.parse(
      readFileSync(join(examplesDir, 'oauth_authorization.example.json'), 'utf8'),
    );

    expect(sessionSchema).toMatchObject({
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      additionalProperties: false,
      required: ['userId', 'token', 'intent'],
      properties: {
        userId: { type: 'string', format: 'uuid' },
        token: {
          type: 'string',
          minLength: 1,
          maxLength: 8192,
          pattern: '^\\S+$',
        },
        intent: { type: 'string', enum: ['LOGIN', 'REGISTER', 'LINK'] },
      },
    });
    expect(Object.keys(sessionSchema.properties).sort()).toEqual(['intent', 'token', 'userId']);
    expect(authorizationSchema).toMatchObject({
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      additionalProperties: false,
      required: ['provider', 'authorizationUrl'],
      properties: {
        provider: { type: 'string', enum: ['GOOGLE', 'FACEBOOK'] },
        authorizationUrl: { type: 'string', format: 'uri' },
      },
      oneOf: [
        {
          required: ['provider', 'authorizationUrl'],
          properties: {
            provider: { const: 'GOOGLE' },
            authorizationUrl: {
              pattern: '^https://accounts\\.google\\.com/o/oauth2/v2/auth(?:\\?[^#]*)?$',
            },
          },
        },
        {
          required: ['provider', 'authorizationUrl'],
          properties: {
            provider: { const: 'FACEBOOK' },
            authorizationUrl: {
              pattern: '^https://www\\.facebook\\.com/v[0-9]+(?:\\.[0-9]+)?/dialog/oauth(?:\\?[^#]*)?$',
            },
          },
        },
      ],
    });
    expect(Object.keys(authorizationSchema.properties).sort()).toEqual(['authorizationUrl', 'provider']);

    const openapi = JSON.parse(readFileSync(join(contractsDir, 'openapi.json'), 'utf8'));
    const { $schema: sessionDraft, title: sessionTitle, ...sessionConstraints } = sessionSchema;
    const {
      $schema: authorizationDraft,
      title: authorizationTitle,
      ...authorizationConstraints
    } = authorizationSchema;
    expect(sessionDraft).toBe('http://json-schema.org/draft-07/schema#');
    expect(sessionTitle).toBe('OAuthSession');
    expect(authorizationDraft).toBe('http://json-schema.org/draft-07/schema#');
    expect(authorizationTitle).toBe('OAuthAuthorization');
    expect(openapi.components.schemas.OAuthSession).toEqual(sessionConstraints);
    expect(openapi.components.schemas.OAuthAuthorization).toEqual(authorizationConstraints);

    const sessionValidate = ajv.getSchema(`${schemaBaseUri}oauth_session.schema.json`);
    const authorizationValidate = ajv.getSchema(`${schemaBaseUri}oauth_authorization.schema.json`);
    expect(sessionValidate).toBeDefined();
    expect(authorizationValidate).toBeDefined();
    if (!sessionValidate || !authorizationValidate) return;
    expect(sessionValidate(sessionExample)).toBe(true);
    expect(sessionValidate({ ...sessionExample, extra: true })).toBe(false);
    expect(sessionValidate({ ...sessionExample, token: '' })).toBe(false);
    expect(sessionValidate({ ...sessionExample, token: '   ' })).toBe(false);
    expect(sessionValidate({ ...sessionExample, token: `valid${'x'.repeat(8187)}` })).toBe(true);
    expect(sessionValidate({ ...sessionExample, token: `valid${'x'.repeat(8188)}` })).toBe(false);
    expect(authorizationValidate(authorizationExample)).toBe(true);
    expect(authorizationValidate({ ...authorizationExample, extra: true })).toBe(false);
    expect(authorizationValidate({
      provider: 'GOOGLE',
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=synthetic',
    })).toBe(true);
    expect(authorizationValidate({
      provider: 'FACEBOOK',
      authorizationUrl: 'https://www.facebook.com/v19.0/dialog/oauth?state=synthetic',
    })).toBe(true);
    for (const hostileAuthorization of [
      { provider: 'GOOGLE', authorizationUrl: 'http://accounts.google.com/o/oauth2/v2/auth' },
      { provider: 'GOOGLE', authorizationUrl: 'https://accounts.google.com.evil.test/o/oauth2/v2/auth' },
      { provider: 'GOOGLE', authorizationUrl: 'https://www.facebook.com/v19.0/dialog/oauth' },
      { provider: 'FACEBOOK', authorizationUrl: 'https://www.facebook.com/dialog/oauth' },
      { provider: 'FACEBOOK', authorizationUrl: 'https://evil.example.test/v19.0/dialog/oauth' },
      { provider: 'FACEBOOK', authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth' },
    ]) {
      expect(authorizationValidate(hostileAuthorization)).toBe(false);
    }

    expect(sessionExample.token).toBe('synthetic-session-token');
    expect(sessionExample.token).not.toMatch(/^[^.]+\.[^.]+\.[^.]+$/);
    const authorizationUrl = new URL(authorizationExample.authorizationUrl);
    expect(authorizationUrl.origin).toBe('https://accounts.google.com');
    expect(authorizationUrl.pathname).toBe('/o/oauth2/v2/auth');
    expect(authorizationUrl.search).toBe('');
    expect(authorizationUrl.hash).toBe('');
  });

  it('registers strict shared auth and phone contracts with safe synthetic examples', () => {
    const expectedContracts = [
      ['auth_session', 'auth_session'],
      ['phone_otp_challenge', 'phone_otp_challenge'],
      ['phone_account_status', 'phone_account_status'],
      ['auth_me', 'auth_me'],
      ['auth_providers', 'auth_providers'],
    ].map(([id, file]) => ({
      id,
      schema: `json/${file}.schema.json`,
      example: `examples/${file}.example.json`,
    }));
    expect(manifest.contracts).toEqual(expect.arrayContaining(expectedContracts));

    for (const entry of expectedContracts) {
      expect(existsSync(join(contractsDir, entry.schema))).toBe(true);
      expect(existsSync(join(contractsDir, entry.example))).toBe(true);
    }

    const authSession = JSON.parse(readFileSync(join(schemasDir, 'auth_session.schema.json'), 'utf8'));
    const oauthSession = JSON.parse(readFileSync(join(schemasDir, 'oauth_session.schema.json'), 'utf8'));
    const challenge = JSON.parse(readFileSync(join(schemasDir, 'phone_otp_challenge.schema.json'), 'utf8'));
    const phoneStatus = JSON.parse(readFileSync(join(schemasDir, 'phone_account_status.schema.json'), 'utf8'));
    const authMe = JSON.parse(readFileSync(join(schemasDir, 'auth_me.schema.json'), 'utf8'));
    const providers = JSON.parse(readFileSync(join(schemasDir, 'auth_providers.schema.json'), 'utf8'));
    const { $schema: authDraft, title: authTitle, ...authConstraints } = authSession;
    const { $schema: oauthDraft, title: oauthTitle, ...oauthConstraints } = oauthSession;

    expect(authDraft).toBe('http://json-schema.org/draft-07/schema#');
    expect(authTitle).toBe('AuthSession');
    expect(oauthDraft).toBe('http://json-schema.org/draft-07/schema#');
    expect(oauthTitle).toBe('OAuthSession');
    expect(oauthConstraints).toEqual({
      ...authConstraints,
      required: ['userId', 'token', 'intent'],
      properties: {
        ...authConstraints.properties,
        intent: { type: 'string', enum: ['LOGIN', 'REGISTER', 'LINK'] },
      },
    });
    expect(challenge).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['challengeToken', 'expiresAt', 'resendAvailableAt'],
      properties: {
        challengeToken: {
          type: 'string', minLength: 43, maxLength: 43, pattern: '^[A-Za-z0-9_-]{43}$',
        },
        expiresAt: { type: 'string', format: 'date-time' },
        resendAvailableAt: { type: 'string', format: 'date-time' },
      },
    });
    expect(Object.keys(challenge.properties).sort()).toEqual([
      'challengeToken', 'expiresAt', 'resendAvailableAt',
    ]);
    expect(phoneStatus).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['phoneVerified', 'maskedPhone'],
      properties: {
        phoneVerified: { type: 'boolean' },
        maskedPhone: { type: ['string', 'null'] },
      },
    });
    expect(authMe.properties.phone).toEqual({
      $ref: 'phone_account_status.schema.json',
    });
    expect(providers).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['google', 'facebook', 'phoneOtp'],
      properties: {
        google: { type: 'boolean' },
        facebook: { type: 'boolean' },
        phoneOtp: { type: 'boolean' },
      },
    });

    for (const file of [
      'auth_session', 'phone_otp_challenge', 'phone_account_status', 'auth_me', 'auth_providers',
    ]) {
      const validate = ajv.getSchema(`${schemaBaseUri}${file}.schema.json`);
      const example = JSON.parse(readFileSync(join(examplesDir, `${file}.example.json`), 'utf8'));
      expect(validate).toBeDefined();
      if (!validate) continue;
      expect({ valid: validate(example), errors: validate.errors }).toEqual({ valid: true, errors: null });
      expect(validate({ ...example, unexpected: true })).toBe(false);
    }

    const validateChallenge = ajv.getSchema(`${schemaBaseUri}phone_otp_challenge.schema.json`)!;
    const challengeExample = JSON.parse(
      readFileSync(join(examplesDir, 'phone_otp_challenge.example.json'), 'utf8'),
    );
    for (const sensitive of ['otp', 'code', 'phone', 'phoneE164', 'provider', 'userId']) {
      expect(validateChallenge({ ...challengeExample, [sensitive]: 'synthetic-secret' })).toBe(false);
    }
    const validateStatus = ajv.getSchema(`${schemaBaseUri}phone_account_status.schema.json`)!;
    expect(validateStatus({ phoneVerified: false, maskedPhone: null })).toBe(true);
    expect(validateStatus({ phoneVerified: true, maskedPhone: '+84******678' })).toBe(true);
    expect(validateStatus({ phoneVerified: true, maskedPhone: '+84912345678' })).toBe(false);
    expect(validateStatus({ phoneVerified: false, maskedPhone: '+84******678' })).toBe(false);
  });

  it('documents the complete public phone login and authenticated phone-link API surface', () => {
    const openapi = JSON.parse(readFileSync(join(contractsDir, 'openapi.json'), 'utf8'));
    expect(openapi.components.schemas.AuthSession).toEqual(expect.any(Object));
    expect(openapi.components.schemas.PhoneOtpChallenge).toEqual(expect.any(Object));
    expect(openapi.components.schemas.PhoneAccountStatus).toEqual(expect.any(Object));
    expect(openapi.components.schemas.AuthMe).toEqual(expect.any(Object));
    expect(openapi.components.schemas.AuthProviders).toEqual(expect.any(Object));

    const expectedOperations = [
      ['/auth/phone/request', 'post', 'requestPhoneLoginOtp', []],
      ['/auth/phone/verify', 'post', 'verifyPhoneLoginOtp', []],
      ['/auth/phone/register/request', 'post', 'requestPhoneRegisterOtp', []],
      ['/auth/phone/register/verify', 'post', 'verifyPhoneRegisterOtp', []],
      ['/auth/phone/link/request', 'post', 'requestPhoneLinkOtp', [{ BearerAuth: [] }]],
      ['/auth/phone/link/verify', 'post', 'verifyPhoneLinkOtp', [{ BearerAuth: [] }]],
      ['/auth/phone', 'get', 'getPhoneAccountStatus', [{ BearerAuth: [] }]],
      ['/auth/me', 'get', 'getAuthenticatedUser', [{ BearerAuth: [] }]],
      ['/auth/providers', 'get', 'getAuthProviders', []],
      ['/auth/profile', 'put', 'updateAuthenticatedProfile', [{ BearerAuth: [] }]],
    ] as const;
    for (const [path, method, operationId, security] of expectedOperations) {
      const operation = openapi.paths[path]?.[method];
      expect(operation).toBeDefined();
      expect(operation?.operationId).toBe(operationId);
      expect(operation?.security).toEqual(security);
    }
    expect(openapi.paths['/profile']).toBeUndefined();

    for (const path of ['/auth/phone/request', '/auth/phone/register/request', '/auth/phone/link/request']) {
      const operation = openapi.paths[path].post;
      expect(operation.requestBody.content['application/json'].schema).toEqual({
        type: 'object',
        additionalProperties: false,
        required: ['phone'],
        properties: { phone: { type: 'string', minLength: 1, maxLength: 64 } },
      });
      expect(operation.responses['202'].content['application/json'].schema.properties.data)
        .toEqual({ $ref: '#/components/schemas/PhoneOtpChallenge' });
      const challengeProperties = openapi.components.schemas.PhoneOtpChallenge.properties;
      expect(Object.keys(challengeProperties).sort()).toEqual([
        'challengeToken', 'expiresAt', 'resendAvailableAt',
      ]);
      expect(challengeProperties).not.toHaveProperty('otp');
      expect(challengeProperties).not.toHaveProperty('code');
      expect(challengeProperties).not.toHaveProperty('phone');
      expect(challengeProperties).not.toHaveProperty('phoneE164');
      expect(challengeProperties).not.toHaveProperty('providerResponse');
      expect(challengeProperties).not.toHaveProperty('userId');
    }

    for (const path of ['/auth/phone/verify', '/auth/phone/register/verify', '/auth/phone/link/verify']) {
      const operation = openapi.paths[path].post;
      expect(operation.parameters).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'yte_phone_binding', in: 'cookie', required: true }),
      ]));
      expect(operation.requestBody.content['application/json'].schema).toEqual({
        type: 'object',
        additionalProperties: false,
        required: ['challengeToken', 'code'],
        properties: {
          challengeToken: {
            type: 'string', minLength: 43, maxLength: 43, pattern: '^[A-Za-z0-9_-]{43}$',
          },
          code: { type: 'string', minLength: 6, maxLength: 6, pattern: '^[0-9]{6}$' },
        },
      });
    }
    expect(openapi.paths['/auth/phone/verify'].post.responses['200']
      .content['application/json'].schema.properties.data)
      .toEqual({ $ref: '#/components/schemas/AuthSession' });
    expect(openapi.paths['/auth/phone/register/verify'].post.responses['200']
      .content['application/json'].schema.properties.data)
      .toEqual({ $ref: '#/components/schemas/AuthSession' });
    expect(openapi.paths['/auth/phone/link/verify'].post.responses['200']
      .content['application/json'].schema.properties.data)
      .toEqual({ $ref: '#/components/schemas/PhoneAccountStatus' });
    expect(openapi.paths['/auth/phone'].get.responses['200']
      .content['application/json'].schema.properties.data)
      .toEqual({ $ref: '#/components/schemas/PhoneAccountStatus' });
    expect(openapi.paths['/auth/me'].get.responses['200']
      .content['application/json'].schema.properties.data)
      .toEqual({ $ref: '#/components/schemas/AuthMe' });
    expect(openapi.paths['/auth/providers'].get.responses['200']
      .content['application/json'].schema.properties.data.properties.providers)
      .toEqual({ $ref: '#/components/schemas/AuthProviders' });
  });

  it('keeps password sessions and phone error statuses synchronized with runtime controllers', () => {
    const openapi = JSON.parse(readFileSync(join(contractsDir, 'openapi.json'), 'utf8'));

    expect(openapi.paths['/auth/register'].post.responses['201']
      .content['application/json'].schema.properties.data)
      .toEqual({ $ref: '#/components/schemas/AuthSession' });
    expect(openapi.paths['/auth/register'].post.responses['200']).toBeUndefined();
    expect(openapi.paths['/auth/login'].post.responses['200']
      .content['application/json'].schema.properties.data)
      .toEqual({ $ref: '#/components/schemas/AuthSession' });

    const loginVerifyResponses = openapi.paths['/auth/phone/verify'].post.responses;
    expect(Object.keys(loginVerifyResponses)).toEqual(expect.arrayContaining([
      '200', '400', '429', '500', '503',
    ]));
    expect(loginVerifyResponses['401']).toBeUndefined();
    expect(loginVerifyResponses['423']).toBeUndefined();

    const linkVerifyResponses = openapi.paths['/auth/phone/link/verify'].post.responses;
    expect(Object.keys(linkVerifyResponses)).toEqual(expect.arrayContaining([
      '200', '400', '401', '409', '429', '500', '503',
    ]));
    expect(linkVerifyResponses['423']).toBeUndefined();

    for (const path of [
      '/auth/phone/request',
      '/auth/phone/verify',
      '/auth/phone/register/request',
      '/auth/phone/register/verify',
      '/auth/phone/link/request',
      '/auth/phone/link/verify',
    ]) {
      const responses = openapi.paths[path].post.responses;
      for (const [status, response] of Object.entries(responses) as Array<[string, any]>) {
        if (status === '401' && path.includes('/link/')) {
          expect(response.headers?.['Cache-Control']).toBeUndefined();
          continue;
        }
        expect(response.headers?.['Cache-Control']).toEqual({
          schema: { type: 'string', const: 'no-store' },
        });
      }
    }

    expect(Object.keys(openapi.paths['/auth/profile'])).toEqual(['put']);
  });

  it('keeps the full LabAnalysis physical contract strict at the root and result item', () => {
    const validate = ajv.getSchema(`${schemaBaseUri}lab_analysis.schema.json`);
    expect(validate).toBeDefined();
    if (!validate) return;

    const example = JSON.parse(
      readFileSync(join(contractsDir, 'examples/lab_analysis.example.json'), 'utf8'),
    );
    expect(validate({ ...example, unexpected: true })).toBe(false);
    expect(validate({
      ...example,
      results: [{ ...example.results[0], unexpected: true }],
    })).toBe(false);
  });

  it('requires non-empty narrative fields in physical and OpenAPI report detail contracts', () => {
    const physicalSchema = JSON.parse(
      readFileSync(join(schemasDir, 'report_detail.schema.json'), 'utf8'),
    );
    const example = JSON.parse(
      readFileSync(join(examplesDir, 'report_detail.example.json'), 'utf8'),
    );
    const openapi = JSON.parse(readFileSync(join(contractsDir, 'openapi.json'), 'utf8'));

    expect(physicalSchema.required).toContain('overallSummary');
    expect(physicalSchema.properties.overallSummary).toEqual({
      type: 'string',
      minLength: 1,
      pattern: '\\S',
    });
    expect(physicalSchema.properties.results.items.required).toContain('explanation');
    expect(physicalSchema.properties.results.items.properties.explanation)
      .toEqual({ type: 'string', minLength: 1, pattern: '\\S' });
    expect(openapi.components.schemas.ReportDetail.required).toContain('overallSummary');
    expect(openapi.components.schemas.PersistedLabResult.required).toContain('explanation');
    expect(openapi.components.schemas.ReportDetail.properties.overallSummary.pattern).toBe('\\S');
    expect(openapi.components.schemas.PersistedLabResult.properties.explanation.pattern).toBe('\\S');

    const physicalValidate = ajv.getSchema(`${schemaBaseUri}report_detail.schema.json`);
    expect(physicalValidate).toBeDefined();
    if (!physicalValidate) return;
    expect(physicalValidate(example)).toBe(true);
    expect(physicalValidate({ ...example, overallSummary: '' })).toBe(false);
    expect(physicalValidate({ ...example, overallSummary: '   ' })).toBe(false);
    expect(physicalValidate({
      ...example,
      results: [{ ...example.results[0], explanation: '' }],
    })).toBe(false);
    expect(physicalValidate({
      ...example,
      results: [{ ...example.results[0], explanation: '   ' }],
    })).toBe(false);

    const openapiAjv = new Ajv({ strict: false, allErrors: true });
    addFormats(openapiAjv);
    const openapiValidate = openapiAjv.compile({
      $schema: 'http://json-schema.org/draft-07/schema#',
      $ref: '#/components/schemas/ReportDetail',
      components: openapi.components,
    });
    expect(openapiValidate({ ...example, overallSummary: '   ' })).toBe(false);
    expect(openapiValidate({
      ...example,
      results: [{ ...example.results[0], explanation: '   ' }],
    })).toBe(false);
  });

  it.each([
    ['lab_analysis', 'LabAnalysis'],
    ['history_list', 'HistoryList'],
    ['report_detail', 'ReportDetail'],
    ['oauth_session', 'OAuthSession'],
    ['auth_session', 'AuthSession'],
    ['phone_otp_challenge', 'PhoneOtpChallenge'],
    ['phone_account_status', 'PhoneAccountStatus'],
    ['auth_me', 'AuthMe'],
    ['auth_providers', 'AuthProviders'],
    ['oauth_authorization', 'OAuthAuthorization'],
  ])('keeps the physical %s example synchronized with OpenAPI %s', (contractId, componentName) => {
    const entry = manifest.contracts.find((contract) => contract.id === contractId);
    expect(entry).toBeDefined();
    if (!entry) return;

    const example = JSON.parse(readFileSync(join(contractsDir, entry.example), 'utf8'));
    const openapi = JSON.parse(readFileSync(join(contractsDir, 'openapi.json'), 'utf8'));
    expect(openapi.components.schemas[componentName]).toBeDefined();
    if (!openapi.components.schemas[componentName]) return;

    const openapiAjv = new Ajv({ strict: false, allErrors: true });
    addFormats(openapiAjv);
    const validate = openapiAjv.compile({
      $schema: 'http://json-schema.org/draft-07/schema#',
      $ref: `#/components/schemas/${componentName}`,
      components: openapi.components,
    });
    expect({ valid: validate(example), errors: validate.errors })
      .toEqual({ valid: true, errors: null });
  });

  it('uses the LabAnalysis component for the confirm response', () => {
    const openapi = JSON.parse(readFileSync(join(contractsDir, 'openapi.json'), 'utf8'));
    const responseData = openapi.paths['/analysis/confirm'].post.responses['200']
      .content['application/json'].schema.properties.data.properties;

    expect(responseData.analysis).toEqual({ $ref: '#/components/schemas/LabAnalysis' });
  });

  it('documents strict OAuth exchange and authenticated provider-link responses', () => {
    const openapi = JSON.parse(readFileSync(join(contractsDir, 'openapi.json'), 'utf8'));
    const exchange = openapi.paths['/auth/oauth/exchange'].post;
    const exchangeRequest = exchange.requestBody.content['application/json'].schema;
    const exchangeResponse = exchange.responses['200'].content['application/json'].schema;

    expect(exchange.operationId).toBe('exchangeOAuthCallbackCode');
    expect(exchange.security).toEqual([]);
    expect(exchange.parameters).toEqual([{
      name: 'yte_oauth_binding',
      in: 'cookie',
      required: true,
      description: 'HttpOnly browser correlation cookie issued when OAuth starts.',
      schema: {
        type: 'string',
        minLength: 43,
        maxLength: 43,
        pattern: '^[A-Za-z0-9_-]{43}$',
      },
    }]);
    expect(exchangeRequest).toEqual({
      type: 'object',
      additionalProperties: false,
      required: ['code', 'intent'],
      properties: {
        code: {
          type: 'string',
          minLength: 43,
          maxLength: 43,
          pattern: '^[A-Za-z0-9_-]{43}$',
        },
        intent: { type: 'string', enum: ['LOGIN', 'REGISTER', 'LINK'] },
      },
    });
    expect(exchangeResponse).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['success', 'data', 'error'],
      properties: {
        success: { const: true },
        data: { $ref: '#/components/schemas/OAuthSession' },
        error: { type: 'null' },
      },
    });

    expect(openapi.components.securitySchemes.BearerAuth).toEqual({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    });
    expect(openapi.components.schemas.ApiErrorResponse).toEqual({
      type: 'object',
      additionalProperties: false,
      required: ['success', 'data', 'error'],
      properties: {
        success: { const: false },
        data: { type: 'null' },
        error: {
          type: 'object',
          additionalProperties: false,
          required: ['code', 'message'],
          properties: {
            code: {
              type: 'string',
              minLength: 1,
              maxLength: 128,
              pattern: '^[A-Z][A-Z0-9_]*$',
            },
            message: {
              type: 'string',
              minLength: 1,
              maxLength: 1000,
              pattern: '\\S',
            },
            details: {
              type: 'array',
              minItems: 1,
              items: { $ref: '#/components/schemas/ValidationIssue' },
            },
          },
        },
      },
    });
    expect(openapi.components.schemas.ValidationIssue).toEqual({
      type: 'object',
      additionalProperties: true,
      required: ['code', 'message', 'path'],
      properties: {
        code: { type: 'string', minLength: 1, maxLength: 128 },
        message: { type: 'string', minLength: 1, maxLength: 1000 },
        path: {
          type: 'array',
          items: {
            oneOf: [
              { type: 'string' },
              { type: 'integer' },
            ],
          },
        },
      },
    });
    for (const status of ['400', '409', '502', '500']) {
      expect(exchange.responses[status].content['application/json'].schema).toEqual({
        $ref: '#/components/schemas/ApiErrorResponse',
      });
    }
    const oauthOpenapiAjv = new Ajv({ strict: false, allErrors: true });
    addFormats(oauthOpenapiAjv);
    for (const [providerPath, provider, operationId] of [
      ['/auth/google/link', 'GOOGLE', 'startGoogleOAuthLink'],
      ['/auth/facebook/link', 'FACEBOOK', 'startFacebookOAuthLink'],
    ] as const) {
      const operation = openapi.paths[providerPath].post;
      expect(operation.operationId).toBe(operationId);
      expect(operation.security).toEqual([{ BearerAuth: [] }]);
      const response = operation.responses['200'].content['application/json'].schema;
      expect(response).toMatchObject({
        type: 'object',
        additionalProperties: false,
        required: ['success', 'data', 'error'],
        properties: {
          success: { const: true },
          error: { type: 'null' },
        },
      });
      expect(response.properties.data.allOf).toEqual(expect.arrayContaining([
        { $ref: '#/components/schemas/OAuthAuthorization' },
        expect.objectContaining({
          properties: { provider: { const: provider } },
        }),
      ]));
      for (const status of ['401', '429', '503', '500']) {
        expect(operation.responses[status].content['application/json'].schema).toEqual({
          $ref: '#/components/schemas/ApiErrorResponse',
        });
      }
      const validateAuthorization = oauthOpenapiAjv.compile({
        $schema: 'http://json-schema.org/draft-07/schema#',
        ...response.properties.data,
        components: openapi.components,
      });
      const validAuthorizationUrl = provider === 'GOOGLE'
        ? 'https://accounts.google.com/o/oauth2/v2/auth?state=synthetic'
        : 'https://www.facebook.com/v19.0/dialog/oauth?state=synthetic';
      expect(validateAuthorization({ provider, authorizationUrl: validAuthorizationUrl })).toBe(true);
      expect(validateAuthorization({
        provider: provider === 'GOOGLE' ? 'FACEBOOK' : 'GOOGLE',
        authorizationUrl: validAuthorizationUrl,
      })).toBe(false);
    }

    const errorAjv = new Ajv({ strict: false, allErrors: true });
    const validateError = errorAjv.compile({
      $schema: 'http://json-schema.org/draft-07/schema#',
      $ref: '#/components/schemas/ApiErrorResponse',
      components: openapi.components,
    });
    const errorExample = {
      success: false,
      data: null,
      error: { code: 'INVALID_OAUTH_CODE', message: 'Synthetic OAuth error.' },
    };
    expect(validateError(errorExample)).toBe(true);
    expect(validateError({ ...errorExample, unexpected: true })).toBe(false);
    expect(validateError({
      ...errorExample,
      error: { ...errorExample.error, unexpected: true },
    })).toBe(false);
  });

  it('documents provider callbacks as code-only redirects without token or user identifiers', () => {
    const openapi = JSON.parse(readFileSync(join(contractsDir, 'openapi.json'), 'utf8'));
    const forbiddenQueryNames = ['token', 'jwt', 'access_token', 'refresh_token', 'userId'];

    expect(openapi.components.schemas.OAuthCallbackLocation).toEqual({
      type: 'string',
      format: 'uri',
      pattern: '^https?://[^/?#@\\s]+/oauth/callback\\?code=[A-Za-z0-9_-]{43}&intent=(?:LOGIN|REGISTER|LINK)$',
    });
    const callbackLocationAjv = new Ajv({ strict: false, allErrors: true });
    addFormats(callbackLocationAjv);
    const validateCallbackLocation = callbackLocationAjv.compile({
      $schema: 'http://json-schema.org/draft-07/schema#',
      $ref: '#/components/schemas/OAuthCallbackLocation',
      components: openapi.components,
    });
    for (const safeLocation of [
      `http://localhost:5173/oauth/callback?code=${'C'.repeat(43)}&intent=LOGIN`,
      `http://127.0.0.1:5173/oauth/callback?code=${'C'.repeat(43)}&intent=REGISTER`,
      `https://app.example.test/oauth/callback?code=${'C'.repeat(43)}&intent=LINK`,
    ]) {
      expect(validateCallbackLocation(safeLocation)).toBe(true);
    }
    for (const unsafeLocation of [
      `ftp://app.example.test/oauth/callback?code=${'C'.repeat(43)}`,
      `https://user:pass@app.example.test/oauth/callback?code=${'C'.repeat(43)}`,
      `http://localhost:5173/other?code=${'C'.repeat(43)}`,
      `http://localhost:5173/oauth/callback?code=${'C'.repeat(43)}&intent=LOGIN&token=synthetic`,
      `http://localhost:5173/oauth/callback?code=${'C'.repeat(43)}&intent=login`,
      `http://localhost:5173/oauth/callback?code=${'C'.repeat(43)}#fragment`,
    ]) {
      expect(validateCallbackLocation(unsafeLocation)).toBe(false);
    }

    for (const [callbackPath, operationId] of [
      ['/auth/google/callback', 'completeGoogleOAuthCallback'],
      ['/auth/facebook/callback', 'completeFacebookOAuthCallback'],
    ] as const) {
      const operation = openapi.paths[callbackPath].get;
      expect(operation.operationId).toBe(operationId);
      expect(operation.security).toEqual([]);
      const queryNames = (operation.parameters ?? [])
        .filter((parameter: { in: string }) => parameter.in === 'query')
        .map((parameter: { name: string }) => parameter.name);
      expect(queryNames).toEqual(expect.arrayContaining(['code', 'state']));
      expect(queryNames).toEqual(expect.not.arrayContaining(forbiddenQueryNames));
      const parametersByName = Object.fromEntries(
        operation.parameters.map((parameter: { name: string }) => [parameter.name, parameter]),
      );
      expect(parametersByName.state.required).toBe(true);
      expect(parametersByName.code.required).toBe(false);
      expect(parametersByName.error.required).toBe(false);
      expect(operation.responses['302'].headers.Location.schema).toEqual({
        $ref: '#/components/schemas/OAuthCallbackLocation',
      });
      for (const status of ['429', '500']) {
        expect(operation.responses[status].content['application/json'].schema).toEqual({
          $ref: '#/components/schemas/ApiErrorResponse',
        });
      }
      expect(JSON.stringify(operation.responses['302'])).not.toMatch(
        /token|jwt|access_token|refresh_token|userId/i,
      );
    }
  });

  it('accepts the real OAuth exchange validation-error body in the OpenAPI error contract', () => {
    const invalidExchange = oauthExchangeSchema.safeParse({ code: 'short' });
    expect(invalidExchange.success).toBe(false);
    if (invalidExchange.success) return;

    const openapi = JSON.parse(readFileSync(join(contractsDir, 'openapi.json'), 'utf8'));
    const errorAjv = new Ajv({ strict: false, allErrors: true });
    const validateError = errorAjv.compile({
      $schema: 'http://json-schema.org/draft-07/schema#',
      $ref: '#/components/schemas/ApiErrorResponse',
      components: openapi.components,
    });
    const validationErrorBody = {
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dữ liệu gửi lên không hợp lệ.',
        details: invalidExchange.error.issues,
      },
    };

    expect({ valid: validateError(validationErrorBody), errors: validateError.errors })
      .toEqual({ valid: true, errors: null });
    const [firstIssue] = invalidExchange.error.issues;
    expect(validateError({
      ...validationErrorBody,
      error: {
        ...validationErrorBody.error,
        details: [{ ...firstIssue, path: [true] }],
      },
    })).toBe(false);
    expect(validateError({
      ...validationErrorBody,
      error: {
        ...validationErrorBody.error,
        details: [{ code: firstIssue.code, message: firstIssue.message }],
      },
    })).toBe(false);
  });
});

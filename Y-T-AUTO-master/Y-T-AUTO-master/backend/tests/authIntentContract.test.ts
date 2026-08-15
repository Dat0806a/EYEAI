import { readFileSync } from 'fs';
import { join } from 'path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const contractsDir = join(__dirname, '..', '..', 'contracts');

describe('explicit auth intent contracts', () => {
  it('requires OAuthSession intent and validates the synthetic example', () => {
    const schema = JSON.parse(readFileSync(
      join(contractsDir, 'json', 'oauth_session.schema.json'),
      'utf8',
    ));
    const example = JSON.parse(readFileSync(
      join(contractsDir, 'examples', 'oauth_session.example.json'),
      'utf8',
    ));
    const ajv = new Ajv({ strict: false, allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);

    expect(schema.required).toEqual(['userId', 'token', 'intent']);
    expect(schema.properties.intent).toEqual({
      type: 'string',
      enum: ['LOGIN', 'REGISTER', 'LINK'],
    });
    expect({ valid: validate(example), errors: validate.errors }).toEqual({
      valid: true,
      errors: null,
    });
    expect(validate({ userId: example.userId, token: example.token })).toBe(false);
    expect(validate({ ...example, intent: 'login' })).toBe(false);
  });

  it('documents code-and-intent OAuth exchange and purpose-bearing callback redirects', () => {
    const openapi = JSON.parse(readFileSync(join(contractsDir, 'openapi.json'), 'utf8'));
    const exchange = openapi.paths['/auth/oauth/exchange'].post;
    const requestSchema = exchange.requestBody.content['application/json'].schema;

    expect(requestSchema.required).toEqual(['code', 'intent']);
    expect(requestSchema.properties.intent).toEqual({
      type: 'string',
      enum: ['LOGIN', 'REGISTER', 'LINK'],
    });
    expect(openapi.components.schemas.OAuthSession.required).toEqual(['userId', 'token', 'intent']);
    expect(openapi.components.schemas.OAuthCallbackLocation.pattern).toBe(
      '^https?://[^/?#@\\s]+/oauth/callback\\?code=[A-Za-z0-9_-]{43}&intent=(?:LOGIN|REGISTER|LINK)$',
    );
  });

  it('documents public phone registration without changing login or link response shapes', () => {
    const openapi = JSON.parse(readFileSync(join(contractsDir, 'openapi.json'), 'utf8'));
    const expected = [
      ['/auth/phone/register/request', 'requestPhoneRegisterOtp', '202', 'PhoneOtpChallenge'],
      ['/auth/phone/register/verify', 'verifyPhoneRegisterOtp', '200', 'AuthSession'],
    ] as const;

    for (const [path, operationId, status, component] of expected) {
      const operation = openapi.paths[path]?.post;
      expect(operation).toBeDefined();
      expect(operation.operationId).toBe(operationId);
      expect(operation.security).toEqual([]);
      expect(operation.responses[status].content['application/json'].schema.properties.data)
        .toEqual({ $ref: `#/components/schemas/${component}` });
    }
    expect(openapi.paths['/auth/phone/verify'].post.responses['200']
      .content['application/json'].schema.properties.data)
      .toEqual({ $ref: '#/components/schemas/AuthSession' });
    expect(openapi.paths['/auth/phone/link/verify'].post.responses['200']
      .content['application/json'].schema.properties.data)
      .toEqual({ $ref: '#/components/schemas/PhoneAccountStatus' });
  });

  it('documents explicit LOGIN/REGISTER query intent for public social starts', () => {
    const openapi = JSON.parse(readFileSync(join(contractsDir, 'openapi.json'), 'utf8'));

    for (const path of ['/auth/google', '/auth/facebook']) {
      const operation = openapi.paths[path]?.get;
      expect(operation).toBeDefined();
      const intent = operation.parameters.find((parameter: { name: string }) => parameter.name === 'intent');
      expect(intent).toMatchObject({
        in: 'query',
        required: true,
        schema: { type: 'string', enum: ['LOGIN', 'REGISTER'] },
      });
    }
  });
});

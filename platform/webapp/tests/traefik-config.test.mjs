import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTraefikConfig, APP_PORT_MAP } from '../lib/traefik-config.ts';

test('APP_PORT_MAP covers all 13 catalog apps', () => {
  const expected = [
    'authentik', 'nextcloud', 'it-tools', 'paperless-ngx', 'vaultwarden',
    'bookstack', 'joplin', 'libretranslate', 'ollama', 'openwebui',
    'searxng', 'snipe-it', 'wiki-js'
  ];
  for (const app of expected) {
    assert.ok(APP_PORT_MAP[app] !== undefined, `Missing port for app: ${app}`);
    assert.equal(typeof APP_PORT_MAP[app], 'number');
  }
  // authentik on 9000 as specified
  assert.equal(APP_PORT_MAP['authentik'], 9000);
  // nextcloud on 80
  assert.equal(APP_PORT_MAP['nextcloud'], 80);
});

test('renderTraefikConfig produces valid YAML structure with routers and services', () => {
  const yaml = renderTraefikConfig({
    tenantSlug: 'acme',
    vlanId: 120,
    appNames: ['authentik', 'nextcloud']
  });

  assert.ok(yaml.includes('http:'), 'missing http section');
  assert.ok(yaml.includes('routers:'), 'missing routers section');
  assert.ok(yaml.includes('services:'), 'missing services section');
});

test('renderTraefikConfig includes correct Host rule per app', () => {
  const yaml = renderTraefikConfig({
    tenantSlug: 'acme',
    vlanId: 120,
    appNames: ['authentik', 'nextcloud']
  });

  assert.ok(yaml.includes('Host(`authentik.acme.irongeeks.eu`)'), 'missing authentik host rule');
  assert.ok(yaml.includes('Host(`nextcloud.acme.irongeeks.eu`)'), 'missing nextcloud host rule');
});

test('renderTraefikConfig includes TLS certResolver letsencrypt', () => {
  const yaml = renderTraefikConfig({
    tenantSlug: 'acme',
    vlanId: 120,
    appNames: ['authentik']
  });

  assert.ok(yaml.includes('certResolver: letsencrypt'), 'missing certResolver');
  assert.ok(yaml.includes('tls:'), 'missing tls section');
});

test('renderTraefikConfig backend IP derived from vlanId', () => {
  const yaml = renderTraefikConfig({
    tenantSlug: 'acme',
    vlanId: 120,
    appNames: ['authentik']
  });

  assert.ok(yaml.includes('10.120.10.100'), 'backend IP not derived from vlanId');
});

test('renderTraefikConfig uses correct port for authentik (9000)', () => {
  const yaml = renderTraefikConfig({
    tenantSlug: 'acme',
    vlanId: 120,
    appNames: ['authentik']
  });

  assert.ok(yaml.includes(':9000'), 'expected authentik port 9000 in service URL');
});

test('renderTraefikConfig respects customDomain override', () => {
  const yaml = renderTraefikConfig({
    tenantSlug: 'acme',
    vlanId: 120,
    appNames: ['nextcloud'],
    customDomain: 'cloud.custom.example.com'
  });

  assert.ok(yaml.includes('Host(`cloud.custom.example.com`)'), 'custom domain not applied');
  assert.ok(!yaml.includes('irongeeks.eu'), 'default domain leaked into custom domain config');
});

test('renderTraefikConfig includes websecure entrypoint', () => {
  const yaml = renderTraefikConfig({
    tenantSlug: 'acme',
    vlanId: 120,
    appNames: ['authentik']
  });

  assert.ok(yaml.includes('websecure'), 'missing websecure entrypoint');
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { getAuthorizationUrl, loadConfig } from "../scripts/linkedin.mjs";
import { handleLinkedInOAuth } from "../lib/linkedin.js";

test("Vercel configuration routes LinkedIn endpoints to admin-auth", async () => {
    const raw = await fs.readFile("vercel.json", "utf8");
    const data = JSON.parse(raw);
    const cbRewrite = data.rewrites?.find(r => r.source === "/api/auth/linkedin/callback");
    const apiRewrite = data.rewrites?.find(r => r.source === "/api/linkedin");
    assert.ok(cbRewrite, "Rewrite for /api/auth/linkedin/callback should exist");
    assert.equal(cbRewrite.destination, "/api/admin-auth");
    assert.ok(apiRewrite, "Rewrite for /api/linkedin should exist");
    assert.equal(apiRewrite.destination, "/api/admin-auth");
});

test("Serverless functions in api/ strictly respect the 12-function cap", async () => {
    const files = await fs.readdir("api");
    const serverless = files.filter(f => f.endsWith(".js") && !f.startsWith("_"));
    assert.ok(serverless.length <= 12, `Expected <= 12 serverless functions, found ${serverless.length}: ${serverless.join(", ")}`);
});

test("package.json includes linkedin script shortcut", async () => {
    const raw = await fs.readFile("package.json", "utf8");
    const pkg = JSON.parse(raw);
    assert.equal(pkg.scripts?.linkedin, "node scripts/linkedin.mjs");
});

test("getAuthorizationUrl generates valid LinkedIn OAuth 2.0 URL with required scopes", () => {
    const url = getAuthorizationUrl();
    assert.match(url, /^https:\/\/www\.linkedin\.com\/oauth\/v2\/authorization\?/);
    assert.match(url, /client_id=7783myta62ckmf/);
    assert.match(url, /redirect_uri=https%3A%2F%2Fdesk2quant.com%2Fapi%2Fauth%2Flinkedin%2Fcallback/);
    assert.match(url, /w_member_social/);
    assert.match(url, /openid/);
});

test("handleLinkedInOAuth handles OAuth errors safely", async () => {
    let statusCode = null;
    let bodySent = "";
    const mockReq = { query: { error: "user_cancelled_login", error_description: "The user cancelled." } };
    const mockRes = {
        setHeader() {},
        status(code) {
            statusCode = code;
            return {
                send(body) { bodySent = body; }
            };
        }
    };

    await handleLinkedInOAuth(mockReq, mockRes);
    assert.equal(statusCode, 400);
    assert.match(bodySent, /user_cancelled_login/);
    assert.match(bodySent, /LinkedIn Authorization Denied/);
});

test("handleLinkedInOAuth redirects to LinkedIn when called with no params", async () => {
    let redirectUrl = "";
    let ended = false;
    const mockReq = { query: {} };
    const mockRes = {
        setHeader() {},
        writeHead(code, headers) {
            assert.equal(code, 302);
            redirectUrl = headers?.Location;
        },
        end() { ended = true; }
    };

    await handleLinkedInOAuth(mockReq, mockRes);
    assert.ok(ended);
    assert.match(redirectUrl, /https:\/\/www\.linkedin\.com\/oauth\/v2\/authorization/);
});

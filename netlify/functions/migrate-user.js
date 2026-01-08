/**
 * ONE-TIME MIGRATION: Transfer data from old dev user to new prod user
 *
 * Run once by visiting: https://ztas.io/api/migrate-user
 * DELETE THIS FILE AFTER MIGRATION
 */

import { authenticateRequest } from './lib/auth.js';
import { getNetlifyStore } from '@netlify/blobs';

const STORES = {
  USERS: 'users',
  SITES: 'sites',
  TEAMS: 'teams',
};

function store(name) {
  return getNetlifyStore({ name, siteID: process.env.SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
}

export default async function handler(req, context) {
  // Only allow POST to prevent accidental triggers
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({
      error: 'POST required',
      usage: 'POST /api/migrate-user with Authorization header'
    }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // Authenticate to get new production user ID
  const auth = await authenticateRequest(Object.fromEntries(req.headers));
  if (auth.error) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  const newUserId = auth.user.id;
  const email = 'jasonsutter87@gmail.com'; // Hardcoded for this migration

  try {
    const users = store(STORES.USERS);
    const sites = store(STORES.SITES);
    const teams = store(STORES.TEAMS);

    // Get old user data by email
    const oldUser = await users.get(email, { type: 'json' });
    if (!oldUser) {
      return new Response(JSON.stringify({ error: 'Old user not found', email }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const oldUserId = oldUser.id;
    const results = { oldUserId, newUserId, migrated: {} };

    // 1. Migrate sites
    const oldSitesKey = `user_sites_${oldUserId}`;
    const newSitesKey = `user_sites_${newUserId}`;

    let oldSiteIds = [];
    try {
      oldSiteIds = await sites.get(oldSitesKey, { type: 'json' }) || [];
    } catch (e) {
      oldSiteIds = [];
    }

    if (oldSiteIds.length > 0) {
      // Update each site's userId
      for (const siteId of oldSiteIds) {
        const site = await sites.get(siteId, { type: 'json' });
        if (site) {
          site.userId = newUserId;
          await sites.setJSON(siteId, site);
        }
      }

      // Copy site list to new user
      await sites.setJSON(newSitesKey, oldSiteIds);
      results.migrated.sites = oldSiteIds;
    }

    // 2. Migrate teams
    const oldTeamsKey = `user_teams_${oldUserId}`;
    const newTeamsKey = `user_teams_${newUserId}`;

    let oldTeamIds = [];
    try {
      oldTeamIds = await teams.get(oldTeamsKey, { type: 'json' }) || [];
    } catch (e) {
      oldTeamIds = [];
    }

    if (oldTeamIds.length > 0) {
      // Update team ownership
      for (const teamId of oldTeamIds) {
        const team = await teams.get(teamId, { type: 'json' });
        if (team && team.ownerId === oldUserId) {
          team.ownerId = newUserId;
          await teams.setJSON(teamId, team);
        }

        // Update team members
        const membersKey = `team_members_${teamId}`;
        let members = [];
        try {
          members = await teams.get(membersKey, { type: 'json' }) || [];
        } catch (e) {
          members = [];
        }

        for (const member of members) {
          if (member.userId === oldUserId) {
            member.userId = newUserId;
          }
        }
        if (members.length > 0) {
          await teams.setJSON(membersKey, members);
        }
      }

      await teams.setJSON(newTeamsKey, oldTeamIds);
      results.migrated.teams = oldTeamIds;
    }

    // 3. Update user record with new ID
    oldUser.id = newUserId;
    oldUser.migratedFrom = oldUserId;
    oldUser.migratedAt = new Date().toISOString();
    await users.setJSON(email, oldUser);
    results.migrated.user = true;

    // 4. Create user ID mapping for future lookups
    await users.set(`user_id_map_${newUserId}`, email);
    results.migrated.idMapping = true;

    return new Response(JSON.stringify({
      success: true,
      message: 'Migration complete! Delete this function now.',
      results
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (err) {
    console.error('Migration error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}

export const config = {
  path: '/api/migrate-user'
};

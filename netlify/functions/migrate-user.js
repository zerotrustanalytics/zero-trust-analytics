/**
 * ONE-TIME MIGRATION: Transfer sites from old Clerk user ID to new one
 *
 * Run via: https://ztas.io/.netlify/functions/migrate-user?secret=YOUR_JWT_SECRET
 *
 * DELETE THIS FILE AFTER MIGRATION IS COMPLETE
 */

import { getStore } from '@netlify/blobs';

const OLD_USER_ID = 'user_37mmj9iSc0itwYrcfgM4Hw40Wp4';  // Clerk dev
const NEW_USER_ID = 'user_37xzEo3ajKSoqhYtvQ3Hi5C8HIN';  // Clerk prod

export default async function handler(req, context) {
  // Simple security check - require JWT_SECRET as query param
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');

  if (secret !== process.env.JWT_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const sites = getStore('sites');
    const results = {
      oldUserSites: [],
      migratedSites: [],
      updatedSites: [],
      errors: []
    };

    // 1. Get old user's site list
    const oldUserSitesKey = `user_sites_${OLD_USER_ID}`;
    let oldSiteIds = [];
    try {
      oldSiteIds = await sites.get(oldUserSitesKey, { type: 'json' }) || [];
      results.oldUserSites = oldSiteIds;
    } catch (e) {
      results.errors.push(`Failed to get old user sites: ${e.message}`);
    }

    if (oldSiteIds.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        message: 'No sites found for old user ID',
        results
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 2. Get new user's existing site list (to append, not overwrite)
    const newUserSitesKey = `user_sites_${NEW_USER_ID}`;
    let newSiteIds = [];
    try {
      newSiteIds = await sites.get(newUserSitesKey, { type: 'json' }) || [];
    } catch (e) {
      newSiteIds = [];
    }

    // 3. Update each site's userId and add to new user's list
    for (const siteId of oldSiteIds) {
      try {
        // Get the site
        const site = await sites.get(siteId, { type: 'json' });
        if (site) {
          // Update userId
          site.userId = NEW_USER_ID;
          await sites.setJSON(siteId, site);
          results.updatedSites.push({ siteId, domain: site.domain });

          // Add to new user's list if not already there
          if (!newSiteIds.includes(siteId)) {
            newSiteIds.push(siteId);
            results.migratedSites.push(siteId);
          }
        }
      } catch (e) {
        results.errors.push(`Failed to migrate site ${siteId}: ${e.message}`);
      }
    }

    // 4. Save new user's site list
    await sites.setJSON(newUserSitesKey, newSiteIds);

    // 5. Optionally clear old user's site list (commented out for safety)
    // await sites.delete(oldUserSitesKey);

    return new Response(JSON.stringify({
      success: true,
      message: `Migrated ${results.migratedSites.length} sites from dev to prod user`,
      results
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({
      success: false,
      error: err.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}


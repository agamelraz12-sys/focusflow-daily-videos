'use strict';
/*
 * schedule_buffer.js — books a rendered video into Buffer's queue.
 *
 * Endpoint note, learned the hard way: the old REST API at api.bufferapp.com is
 * retired and answers 401 to every token. The live API is GraphQL at
 * https://api.buffer.com (no /graphql path), Bearer auth.
 */
const https = require('https');

const ENDPOINT_HOST = 'api.buffer.com';

function gql(query, variables) {
  const token = process.env.BUFFER_ACCESS_TOKEN;
  if (!token) throw new Error('BUFFER_ACCESS_TOKEN is missing. Put it in .env');
  const body = JSON.stringify({ query, variables });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: ENDPOINT_HOST,
      path: '/',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(d); } catch (e) { return reject(new Error('Buffer sent non JSON: ' + d.slice(0, 200))); }
        if (parsed.errors) return reject(new Error('Buffer: ' + parsed.errors.map((e) => e.message).join('; ')));
        resolve(parsed.data);
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function listChannels(organizationId) {
  const data = await gql(
    'query Channels($input: ChannelsInput!) { channels(input: $input) { id service name } }',
    { input: { organizationId } },
  );
  return data.channels;
}

const CREATE_POST = `
  mutation CreatePost($input: CreatePostInput!) {
    createPost(input: $input) {
      __typename
      ... on PostActionSuccess { post { id status dueAt } }
      ... on NotFoundError { message }
      ... on UnauthorizedError { message }
      ... on UnexpectedError { message }
      ... on RestProxyError { message }
      ... on LimitReachedError { message }
      ... on InvalidInputError { message }
    }
  }
`;

// Per-platform extras. Instagram gets a Reel that also lands on the grid;
// TikTok and YouTube need a title; YouTube Shorts must be public and not
// flagged for kids or it loses reach.
function metadataFor(platform, { title, firstComment }) {
  if (platform === 'instagram') {
    return {
      instagram: {
        type: 'reel',
        shouldShareToFeed: true,
        isAiGenerated: true,
        ...(firstComment ? { firstComment } : {}),
      },
    };
  }
  if (platform === 'tiktok') {
    return { tiktok: { title: title.slice(0, 90), isAiGenerated: true } };
  }
  if (platform === 'youtube') {
    return {
      youtube: {
        title: title.slice(0, 90),
        // Buffer rejects a YouTube post outright without this: "Invalid post:
        // YouTube posts require a category." 22 is People & Blogs, the usual
        // home for creator talking-point content. 27 is Education, 26 Howto.
        categoryId: process.env.YOUTUBE_CATEGORY_ID || '22',
        privacy: 'public',
        madeForKids: false,
        notifySubscribers: true,
        embeddable: true,
        isAiGenerated: true,
      },
    };
  }
  return {};
}

/*
 * Schedule one video on one channel. `dueAt` is an ISO string in UTC.
 */
async function schedule({ platform, channelId, videoUrl, caption, title, firstComment, dueAt }) {
  const input = {
    channelId,
    text: caption,
    dueAt,
    mode: 'customScheduled',
    schedulingType: 'automatic',
    needsApproval: false,
    aiAssisted: true,
    source: 'focusflow-daily-videos',
    metadata: metadataFor(platform, { title, firstComment }),
    assets: [{ video: { url: videoUrl } }],
  };

  const data = await gql(CREATE_POST, { input });
  const payload = data.createPost;
  if (payload.message) throw new Error(`${payload.__typename}: ${payload.message}`);
  return payload.post;
}

module.exports = { schedule, listChannels, gql };

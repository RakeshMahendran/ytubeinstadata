// services/youtubeService.js
const axios = require("axios");
const { AzureOpenAI } = require("openai");
const dotenv = require("dotenv");
dotenv.config();

// Configuration
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || "AIzaSyBmKvvj027Z4xLv8d7bwJFEhZlGP9t0ScM"
const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT || "https://ai-innovation7209ai181705899158.openai.azure.com/";
const AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY || "67nWrZWs62N62AaZlq4LNBSmZEXRKjZatJZDCYR6i6YSgjbcbhRrJQQJ99BBACHYHv6XJ3w3AAAAACOG2rfF";
const API_VERSION = "2024-05-01-preview";
const MODEL_NAME = "gpt-4o";

// Initialize the Azure OpenAI client
const client = new AzureOpenAI({
  azure_endpoint: AZURE_OPENAI_ENDPOINT,
  api_key: AZURE_OPENAI_API_KEY,
  apiVersion: API_VERSION,
});

/**
 * Get channel ID and basic information
 * @param {string} username - YouTube channel username or query
 * @returns {Promise<Array>} - Channel ID, info object, and error (if any)
 */
async function getChannelIdAndInfo(username) {
  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${username}&key=${YOUTUBE_API_KEY}`;
    const response = await axios.get(url);
    
    if (!response.data.items || response.data.items.length === 0) {
      return [null, null, "❌ No channel found."];
    }
    
    const item = response.data.items[0];
    const channelId = item.id.channelId;
    const title = item.snippet.title;
    
    const aboutUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelId}&key=${YOUTUBE_API_KEY}`;
    const aboutData = await axios.get(aboutUrl);
    const snippet = aboutData.data.items[0].snippet;
    
    const about = snippet.description || "";
    const countryCode = snippet.country || "";
    const country = countryCode === "IN" ? "India" : countryCode || "Unknown";
    
    return [channelId, { title, about, country }, null];
  } catch (error) {
    console.error("Error fetching channel info:", error.message);
    return [null, null, `Error: ${error.message}`];
  }
}

/**
 * Get subscriber count for a channel
 * @param {string} channelId - YouTube channel ID
 * @returns {Promise<number>} - Subscriber count
 */
async function getSubscriberCount(channelId) {
  try {
    const url = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}&key=${YOUTUBE_API_KEY}`;
    const response = await axios.get(url);
    return parseInt(response.data.items[0].statistics.subscriberCount || "0");
  } catch (error) {
    console.error("Error fetching subscriber count:", error.message);
    return 0;
  }
}

/**
 * Fetch recent video snippets from a channel
 * @param {string} channelId - YouTube channel ID
 * @param {number} maxResults - Max number of videos to fetch
 * @returns {Promise<Array>} - Array of video snippets
 */
async function fetchVideoSnippets(channelId, maxResults = 15) {
  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&maxResults=${maxResults}&order=date&type=video&key=${YOUTUBE_API_KEY}`;
    const response = await axios.get(url);
    
    return response.data.items.map(item => ({
      title: item.snippet.title,
      description: item.snippet.description,
      video_id: item.id.videoId,
      published_at: item.snippet.publishedAt
    }));
  } catch (error) {
    console.error("Error fetching video snippets:", error.message);
    return [];
  }
}

/**
 * Get detailed stats for recent videos
 * @param {string} channelId - YouTube channel ID
 * @param {number} count - Number of videos to analyze
 * @returns {Promise<Array>} - Array of video statistics
 */
async function getVideoStats(channelId, count = 15) {
  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=id&channelId=${channelId}&maxResults=${count}&order=date&type=video&key=${YOUTUBE_API_KEY}`;
    const searchResponse = await axios.get(url);
    
    if (!searchResponse.data.items || searchResponse.data.items.length === 0) {
      return [];
    }
    
    const ids = searchResponse.data.items
      .filter(item => item.id && item.id.videoId)
      .map(item => item.id.videoId);
    
    if (ids.length === 0) {
      return [];
    }
    
    const statsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet,contentDetails&id=${ids.join(",")}&key=${YOUTUBE_API_KEY}`;
    const statsResponse = await axios.get(statsUrl);
    
    return statsResponse.data.items || [];
  } catch (error) {
    console.error("Error fetching video stats:", error.message);
    return [];
  }
}

/**
 * Get average views from video stats
 * @param {Array} stats - Array of video statistics
 * @returns {number} - Average views
 */
function getAverageViews(stats) {
  if (!stats || stats.length === 0) return 0;
  
  const views = stats.map(v => parseInt(v.statistics.viewCount || "0"));
  return Math.floor(views.reduce((a, b) => a + b, 0) / views.length);
}

/**
 * Estimate reach based on engagement metrics
 * @param {number} views - View count
 * @param {number} likes - Like count
 * @param {number} comments - Comment count
 * @returns {number} - Estimated reach
 */
function estimateReach(views, likes, comments) {
  // Base multiplier depends on video size
  let base = 0.90;
  if (views >= 100000) base = 0.87;
  if (views >= 500000) base = 0.85;
  if (views >= 1000000) base = 0.83;
  if (views >= 5000000) base = 0.80;
  if (views >= 10000000) base = 0.75;
  
  // Engagement rate adjustment
  const er = views > 0 ? (likes + comments) / views : 0;
  let erAdjust = 0;
  
  if (er > 0.06) erAdjust = 0.02;
  if (er < 0.02) erAdjust = -0.02;
  
  const multiplier = base + erAdjust;
  
  return Math.round(views * multiplier);
}

/**
 * Calculate average estimated reach across videos
 * @param {Array} stats - Array of video statistics
 * @returns {number} - Average estimated reach
 */
function getAverageEstimatedReach(stats) {
  if (!stats || stats.length === 0) return 0;
  
  let total = 0;
  for (const video of stats) {
    const statsObj = video.statistics;
    const views = parseInt(statsObj.viewCount || "0");
    const likes = parseInt(statsObj.likeCount || "0");
    const comments = parseInt(statsObj.commentCount || "0");
    
    total += estimateReach(views, likes, comments);
  }
  
  return Math.floor(total / stats.length);
}

/**
 * Get average views for paid promotions/branded content
 * @param {string} channelId - YouTube channel ID
 * @returns {Promise<Array>} - [Count of branded videos, Average views]
 */
async function getAvgViewsPaidPromos(channelId) {
  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=id&channelId=${channelId}&maxResults=15&order=date&type=video&videoPaidProductPlacement=true&key=${YOUTUBE_API_KEY}`;
    const response = await axios.get(url);
    
    // Extract video IDs
    const items = response.data.items || [];
    const ids = items
      .filter(item => item.id && item.id.videoId)
      .map(item => item.id.videoId);
    
    // If no paid promotions found
    if (ids.length === 0) {
      return [0, 0]; // Return count of 0 and average of 0
    }
    
    // Limit to the last 7 if we have more
    const limitedIds = ids.slice(0, 7);
    
    // Get stats for these videos
    const statsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${limitedIds.join(",")}&key=${YOUTUBE_API_KEY}`;
    const statsResponse = await axios.get(statsUrl);
    const stats = statsResponse.data.items || [];
    
    // Calculate average views
    const views = stats.map(v => parseInt(v.statistics.viewCount || "0"));
    return [
      views.length,
      views.length > 0 ? Math.floor(views.reduce((a, b) => a + b, 0) / views.length) : 0
    ];
  } catch (error) {
    console.error("Error fetching paid promo stats:", error.message);
    return [0, 0];
  }
}

/**
 * Calculate engagement rate based on likes, comments, and views
 * @param {Array} stats - Array of video statistics
 * @returns {number} - Engagement rate percentage
 */
function calculateEngagementRate(stats) {
  if (!stats || stats.length === 0) return 0;
  
  const totalViews = stats.reduce((sum, v) => sum + parseInt(v.statistics.viewCount || "0"), 0);
  const totalLikes = stats.reduce((sum, v) => sum + parseInt(v.statistics.likeCount || "0"), 0);
  const totalComments = stats.reduce((sum, v) => sum + parseInt(v.statistics.commentCount || "0"), 0);
  
  if (totalViews === 0) return 0;
  
  return parseFloat(((totalLikes + totalComments) / totalViews * 100).toFixed(2));
}

/**
 * Calculate average video duration in minutes
 * @param {Array} stats - Array of video statistics
 * @returns {number} - Average duration in minutes
 */
function getVideoDurationStats(stats) {
  if (!stats || stats.length === 0) return 0;
  
  const durations = stats.map(video => {
    const durationStr = video.contentDetails.duration;
    // Parse ISO 8601 duration (PT15M33S format)
    const hoursMatch = durationStr.match(/(\d+)H/);
    const minutesMatch = durationStr.match(/(\d+)M/);
    const secondsMatch = durationStr.match(/(\d+)S/);
    
    let totalSeconds = 0;
    if (hoursMatch) totalSeconds += parseInt(hoursMatch[1]) * 3600;
    if (minutesMatch) totalSeconds += parseInt(minutesMatch[1]) * 60;
    if (secondsMatch) totalSeconds += parseInt(secondsMatch[1]);
    
    return totalSeconds;
  });
  
  const avgSeconds = durations.reduce((a, b) => a + b, 0) / durations.length;
  return parseFloat((avgSeconds / 60).toFixed(1)); // Convert to minutes
}

/**
 * Get comments from a list of videos
 * @param {Array} videoIds - Array of video IDs
 * @param {number} maxPerVideo - Max comments per video
 * @returns {Promise<Array>} - Array of comments
 */
async function getComments(videoIds, maxPerVideo = 30) {
  const comments = [];
  
  for (const videoId of videoIds) {
    try {
      const url = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=${maxPerVideo}&key=${YOUTUBE_API_KEY}`;
      const response = await axios.get(url);
      
      if (response.data.items) {
        for (const item of response.data.items) {
          const snippet = item.snippet.topLevelComment.snippet;
          comments.push(`${snippet.authorDisplayName}: ${snippet.textDisplay}`);
        }
      }
    } catch (error) {
      // Some videos may have comments disabled, continue with others
      continue;
    }
  }
  
  return comments;
}

/**
 * Detect the primary language used in content
 * @param {Array} snippets - Array of video snippets
 * @returns {Promise<Object>} - Language detection results
 */
async function detectContentLanguage(snippets) {
  try {
    const joinedText = snippets
      .map(v => `Title: ${v.title}\nDescription: ${v.description}`)
      .join("\n");
    
    const prompt = `You are a language identification assistant.

Given a list of video titles and descriptions from a YouTube channel, infer the primary content language used in the videos.

Respond in JSON:
{"language": "...", "confidence_reason": "..."}

Videos:
${joinedText}`;
    
    const response = await client.chat.completions.create({
      model: MODEL_NAME,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    });
    
    const content = response.choices[0].message.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error("Error detecting content language:", error.message);
    return { language: "Unknown", confidence_reason: "Error in analysis" };
  }
}

/**
 * Infer specific location based on channel data and comments
 * @param {Object} channelInfo - Channel information
 * @param {Array} videos - Video snippets
 * @param {Array} comments - Video comments
 * @returns {Promise<Object>} - Location inference results
 */
async function inferLocation(channelInfo, videos, comments) {
  try {
    let text = `Channel About: ${channelInfo.about}\nCountry: ${channelInfo.country}\n\nRecent Videos:\n`;
    
    for (const video of videos) {
      text += `Title: ${video.title}\nDescription: ${video.description}\n`;
    }
    
    text += "\nSample Viewer Comments:\n" + comments.slice(0, 100).join("\n");
    
    const prompt = `You are a regional inference expert.

Based on the following YouTube channel data — including channel description, video titles, and viewer comments — infer the most likely city or state the influencer is based in.

Respond only in this JSON format:
{
  "likely_city_or_state": "...",
  "confidence": "high/medium/low",
  "reasoning": "..."
}

Data:
${text}`;
    
    const response = await client.chat.completions.create({
      model: MODEL_NAME,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      max_tokens: 1000,
    });
    
    const content = response.choices[0].message.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error("Error inferring location:", error.message);
    return {
      likely_city_or_state: "Unknown",
      confidence: "low",
      reasoning: "Error during analysis"
    };
  }
}

/**
 * Infer audience demographics from comments
 * @param {Array} comments - Video comments
 * @returns {Promise<Object>} - Demographics inference results
 */
async function inferDemographicsFromComments(comments) {
  try {
    const prompt = `You are an expert in YouTube audience analysis.

Based on these comments, infer:
1. Gender split (male/female percentages)
2. Age distribution (e.g., 12-18: 20%, 18-24: 40%, etc.)
3. Regional distribution within the country (states/cities with approximate percentages)

Respond in JSON:
{
  "gender_split": {
    "male": "XX%",
    "female": "XX%"
  },
  "age_split": {
    "under_18": "XX%",
    "18_24": "XX%",
    "25_34": "XX%",
    "35_plus": "XX%"
  },
  "state_split": {
    "state1": "XX%",
    "state2": "XX%",
    "other": "XX%"
  },
  "observations": "..."
}

Comments:
${JSON.stringify(comments.slice(0, 100), null, 2)}`;
    
    const response = await client.chat.completions.create({
      model: MODEL_NAME,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      max_tokens: 1000,
    });
    
    const content = response.choices[0].message.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error("Error inferring demographics:", error.message);
    return {
      gender_split: { male: "Unknown", female: "Unknown" },
      age_split: { under_18: "Unknown", "18_24": "Unknown", "25_34": "Unknown", "35_plus": "Unknown" },
      state_split: { unknown: "100%" },
      observations: "Error during analysis"
    };
  }
}

/**
 * Main function to analyze a YouTube channel
 * @param {string} username - YouTube channel username or query
 * @returns {Promise<Object>} - Analysis results
 */
async function analyzeChannel(username) {
  try {
    // Get basic channel info
    const [channelId, info, error] = await getChannelIdAndInfo(username);
    if (error) return { error };

    // Get subscriber count
    const subscriberCount = await getSubscriberCount(channelId);

    // Get video data
    const snippets = await fetchVideoSnippets(channelId);
    const stats = await getVideoStats(channelId);

    // Get comments for demographic analysis
    const videoIds = snippets.map(s => s.video_id);
    const comments = await getComments(videoIds);

    // Content Language
    const language = await detectContentLanguage(snippets);

    // Location (specific city/state)
    const location = await inferLocation(info, snippets, comments);

    // Demographics (gender, age, state)
    const demographics = await inferDemographicsFromComments(comments);

    // Performance metrics
    const avgViews = getAverageViews(stats);
    const engagementRate = calculateEngagementRate(stats);
    const avgDuration = getVideoDurationStats(stats);
    
    // NEW: Added average estimated reach
    const avgEstimatedReach = getAverageEstimatedReach(stats);
    
    // NEW: Added branded content analysis
    const [brandedCount, avgBrandedViews] = await getAvgViewsPaidPromos(channelId);

    return {
      channel: {
        id: channelId,
        title: info.title,
        country: info.country,
        subscribers: subscriberCount,
      },
      performance: {
        average_views: avgViews,
        average_estimated_reach: avgEstimatedReach,
        engagement_rate: engagementRate,
        average_duration: avgDuration,
        branded_content: {
          count: brandedCount,
          average_views: avgBrandedViews
        }
      },
      content: {
        language: language,
        videos_analyzed: stats.length,
      },
      location,
      demographics,
    };
  } catch (error) {
    console.error("Error analyzing channel:", error.message);
    return { error: error.message };
  }
}

module.exports = {
  analyzeChannel,
  getChannelIdAndInfo,
  getSubscriberCount,
  fetchVideoSnippets,
  getVideoStats,
  getAverageViews,
  calculateEngagementRate,
  getVideoDurationStats,
  getComments,
  detectContentLanguage,
  inferLocation,
  inferDemographicsFromComments,
  estimateReach,
  getAverageEstimatedReach,
  getAvgViewsPaidPromos
};
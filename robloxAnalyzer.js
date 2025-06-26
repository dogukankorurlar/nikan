const axios = require('axios');
const fs = require('fs');
const { writeFileSync } = fs;
const path = require('path');

const CONFIDENTIAL_IDS = [
  5667528939,
  543401938,
  754490349
];

function getUserId(username) {
  return axios.post('https://users.roblox.com/v1/usernames/users', {
    usernames: [username]
  }).then(res => {
    const user = res.data.data[0];
    if (!user) {
      console.warn(`Username "${username}" not found in response`, res.data);
    }
    return user?.id;
  });
}

async function getUserGroups(userId) {
  const res = await axios.get(`https://groups.roblox.com/v2/users/${userId}/groups/roles`);
  return res.data.data || [];
}

async function getGroupUsers(groupId) {
  const users = [];
  let cursor = null;

  do {
    const res = await axios.get(`https://groups.roproxy.com/v1/groups/${groupId}/users`, {
      params: { cursor },
    });
    const data = res.data;
    for (const user of data.data) {
      users.push({
        userId: user.user.userId,
        role: user.role.name,
        rank: user.role.rank
      });
    }
    cursor = data.nextPageCursor;
  } while (cursor);

  return users;
}

async function getRobloxUserInfo(userId) {
  try {
    const res = await axios.get(`https://users.roblox.com/v1/users/${userId}`);
    if (res?.data?.name && res?.data?.displayName) {
      return {
        name: res.data.name,
        displayName: res.data.displayName
      };
    } else {
      console.warn(`Missing user fields for ID: ${userId}`);
      return { name: `User${userId}`, displayName: `User${userId}` };
    }
  } catch (err) {
    console.warn(`Failed to fetch info for ID ${userId}:`, err.message);
    return { name: `User${userId}`, displayName: `User${userId}` };
  }
}

async function saveGroupUsersHtml(groupId) {
  const users = await getGroupUsers(groupId);
  const grouped = {};

  for (const user of users) {
    if (!grouped[user.role]) {
      grouped[user.role] = [];
    }

    const info = await getRobloxUserInfo(user.userId);
    grouped[user.role].push({
      userId: user.userId,
      name: info.name,
      displayName: info.displayName
    });
  }

  let html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Group ${groupId} Users by Rank</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 20px auto; }
    h2 { margin-top: 30px; }
    ul { list-style: none; padding-left: 0; }
    li { margin: 4px 0; }
  </style>
</head>
<body>
  <h1>Roblox Group ${groupId} Users Categorized by Rank</h1>
`;

  for (const [role, members] of Object.entries(grouped)) {
    html += `<section>\n<h2>${role} (${members.length})</h2>\n<ul>`;
    for (const member of members) {
      html += `<li><a href="https://www.roblox.com/users/${member.userId}/profile" target="_blank">${member.displayName} (@${member.name})</a></li>`;
    }
    html += `</ul>\n</section>\n`;
  }

  html += `</body>\n</html>`;

  const filename = path.join(__dirname, `group_${groupId}_users.html`);
  fs.writeFileSync(filename, html, "utf8");
  return filename;
}

async function getUserFriends(userId) {
  const res = await axios.get(`https://friends.roblox.com/v1/users/${userId}/friends`);
  return res.data.data || [];
}

async function fetchBadges(userId) {
  let cursor = null, badges = [];
  do {
    const res = await axios.get(`https://badges.roproxy.com/v1/users/${userId}/badges?limit=100&sortOrder=Desc${cursor ? `&cursor=${cursor}` : ''}`);
    badges.push(...res.data.data);
    cursor = res.data.nextPageCursor;
  } while (cursor);
  return badges;
}

async function fetchAwardDates(userId, badges) {
  const dates = [];
  const badgeIds = badges.map(b => b.id);
  for (let i = 0; i < badgeIds.length; i += 100) {
    try {
      const res = await axios.get(`https://badges.roproxy.com/v1/users/${userId}/badges/awarded-dates`, {
        params: { badgeIds: badgeIds.slice(i, i + 100) }
      });
      res.data.data.forEach(b => dates.push(b.awardedDate));
    } catch {}
  }
  return dates;
}

function getUserInfo(userId) {
  return axios.get(`https://users.roblox.com/v1/users/${userId}`)
    .then(res => res.data);
}

async function getUserGroupRank(userId, groupId) {
  try {
    const res = await axios.get(`https://groups.roblox.com/v2/users/${userId}/groups/roles`);
    const group = res.data.data.find(g => g.group.id === groupId);

    if (!group) {
      return { inGroup: false };
    }

    return {
      inGroup: true,
      role: group.role.name,
      rank: group.role.rank
    };
  } catch (err) {
    console.error("Failed to fetch group rank:", err);
    throw err;
  }
}

function generateHtml(username, groups, friends, badges, badgeDates) {
  const dateCounts = badgeDates.reduce((acc, d) => {
    const day = d.split('T')[0];
    acc[day] = (acc[day] || 0) + 1;
    return acc;
  }, {});
  const dates = Object.keys(dateCounts).sort();
  const counts = dates.map((d, i) => dates.slice(0, i + 1).reduce((sum, d2) => sum + dateCounts[d2], 0));
  const groupHtml = groups.map(g => `<li>${g.group.name} - ${g.role.name}</li>`).join('');
  const friendHtml = friends.map(f => `<li>${f.displayName} (@${f.name})</li>`).join('');

  return `
<!DOCTYPE html><html><head>
<meta charset="UTF-8"><title>${username}</title>
<script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
</head><body>
<h1>Analysis for ${username}</h1>
<h2>Groups (${groups.length})</h2><ul>${groupHtml}</ul>
<h2>Friends (${friends.length})</h2><ul>${friendHtml}</ul>
<h2>Badges (${badges.length})</h2><div id="plot" style="width:600px;height:400px;"></div>
<script>
  Plotly.newPlot("plot", [{
    x: ${JSON.stringify(dates)},
    y: ${JSON.stringify(counts)},
    mode: "markers"
  }]);
</script>
</body></html>
  `;
}

async function analyzeUser(username) {
  const userId = await getUserId(username);
  if (!userId) throw new Error("User ID not found");

  if (CONFIDENTIAL_IDS.includes(userId)) {
    const error = new Error("This user is blocked from being analyzed.");
    error.code = "CONFIDENTIAL_USER";
    throw error;
  }

  const [userInfo, groups, friends, badges, rank] = await Promise.all([
    getUserInfo(userId),
    getUserGroups(userId),
    getUserFriends(userId),
    fetchBadges(userId),
    getUserGroupRank(userId, 16489754)
  ]);
  const badgeDates = await fetchAwardDates(userId, badges);
  const html = generateHtml(username, groups, friends, badges, badgeDates, rank);
  const filename = `roblox_user_analysis_${username}.html`;
  writeFileSync(filename, html);

  return {
    filename,
    createdAt: userInfo.created,
    friendCount: friends.length,
    groupCount: groups.length,
    licance: rank ? `${rank.role} (Rank ${rank.rank})` : "Not in group"
  };
}

module.exports = {
  generateHtml,
  analyzeUser,
  getUserGroupRank,
  getUserId,
  getGroupUsers,
  saveGroupUsersHtml
};

import axios from "axios";

// --- Configuration et Cache ---
const FOTMOB_BASE_URL = "https://www.fotmob.com/api/";
let xmasHeaderValue = undefined; 
const cache = new Map();
const CACHE_EXPIRATION_MS = 10 * 60 * 1000; // Cache de 10 minutes pour les joueurs

// --- 1. Initialisation du Header x-mas ---
async function ensureXmasHeader() {
    if (xmasHeaderValue) return;
    try {
        const response = await axios.get("http://46.101.91.154:6006/");
        xmasHeaderValue = response.data["x-mas"];
        console.log("⚽ X-MAS Header sync success.");
    } catch (error) {
        console.error("❌ Failed to fetch x-mas header.");
        xmasHeaderValue = "default-fallback";
    }
}

// --- 2. Instance Axios ---
const axiosInstance = axios.create({
    baseURL: FOTMOB_BASE_URL,
    timeout: 10000,
    headers: {
        "Accept": "application/json",
        "User-Agent": "FotMob-Android-App/1000.2.148"
    }
});

axiosInstance.interceptors.request.use(async (config) => {
    await ensureXmasHeader();
    config.headers["x-mas"] = xmasHeaderValue;
    return config;
});

// --- 3. Logique de récupération du joueur ---
async function fetchPlayerData(playerId) {
    const urlPath = `playerData?id=${playerId}`;
    
    // Check Cache
    const cacheEntry = cache.get(urlPath);
    if (cacheEntry && Date.now() < cacheEntry.timestamp + CACHE_EXPIRATION_MS) {
        return cacheEntry.data;
    }
    
    // Request
    const response = await axiosInstance.get(urlPath);
    
    // Save to Cache
    cache.set(urlPath, {
        data: response.data,
        timestamp: Date.now()
    });
    
    return response.data;
}

// --- 4. Handler Vercel ---
export default async function handler(req, res) {
    const { id } = req.query;

    if (!id) {
        return res.status(400).json({ error: "L'ID du joueur est requis (?id=12345)" });
    }

    try {
    const data = await fetchPlayerData(id);

    // 1. Extraction sécurisée des statistiques de la saison
    const seasonStatsGroup = data.playerProps?.find(p => p.title === "Season Stats")?.items || [];
    const stats = {};
    seasonStatsGroup.forEach(item => {
        stats[item.title] = item.value;
    });

    // 2. Construction de l'objet complet
    const cleanData = {
        id: data.id,
        name: data.name,
        fullName: data.origin?.name || data.name,
        birthDate: data.birthDate?.utcTime,
        age: data.birthDate?.age,
        country: data.country,
        // Infos Club
        currentTeam: data.primaryTeam?.name,
        league: data.mainLeague?.name,
        position: data.positionDescription?.primaryPosition?.label,
        marketValue: data.marketValue?.value || "N/A",
        imageUrl: `https://images.fotmob.com/image_resources/playerimages/${id}.png`,
        teamLogo: `https://images.fotmob.com/image_resources/logo/teamlogo/${data.primaryTeam?.id}.png`,
        
        // Statistiques de la saison actuelle
        seasonStatistics: {
            rating: data.lastLeagueRating?.rating || "N/A",
            goals: stats["Goals"] || 0,
            assists: stats["Assists"] || 0,
            appearances: stats["Matches"] || 0,
            yellowCards: stats["Yellow cards"] || 0,
            redCards: stats["Red cards"] || 0
        },

        // Historique récent (Notes des derniers matchs)
        recentForm: data.recentMatches?.map(m => ({
            date: m.matchDate,
            opponent: m.opponentName,
            rating: m.rating,
            isHome: m.isHome
        })) || []
    };

    res.status(200).json(cleanData);

}catch (error) {
        console.error(`Erreur Player ID ${id}:`, error.message);
        res.status(500).json({ error: "Erreur Fotmob", details: error.message });
    }
}

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
    
        // On ne filtre rien, on balance tout le JSON brut
        res.status(200).json(data); 
    
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

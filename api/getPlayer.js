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
    
        const cleanData = {
            // --- Identité ---
            id: data.id,
            name: data.name,
            position: data.positionDescription?.primaryPosition?.label,
            age: data.birthDate?.age,
            country: data.country,
            height: data.playerInformation?.find(i => i.title === "Height")?.value,
            preferredFoot: data.playerInformation?.find(i => i.title === "Preferred foot")?.value,
    
            // --- Statut Actuel ---
            currentTeam: data.primaryTeam?.name,
            marketValue: data.marketValues?.find(v => v.isCurrent)?.value || "N/A",
            isInjured: !!data.injuryInformation,
            injuryDetail: data.injuryInformation?.motive || null,
    
            // --- Palmarès ---
            trophies: data.trophies?.playerTrophies?.map(t => ({
                name: t.competitionName,
                count: t.wonQuantity
            })) || [],
    
            // --- Historique de Carrière (Simplifié) ---
            career: data.careerHistory?.careerItems?.college?.map(c => ({
                team: c.team,
                season: c.season,
                goals: c.goals,
                appearances: c.appearances
            })) || [],
    
            // --- Forme Récente ---
            form: data.recentMatches?.map(m => ({
                opponent: m.opponentName,
                rating: m.rating,
                minutes: m.minutesPlayed
            })).slice(0, 5) // Les 5 derniers matchs
        };
    
        res.status(200).json(cleanData);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

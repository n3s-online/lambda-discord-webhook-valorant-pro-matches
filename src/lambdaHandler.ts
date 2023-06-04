import { Handler } from 'aws-lambda';
import { MessageBuilder, Webhook } from 'discord-webhook-node';
import * as z from 'zod';
import axios from 'axios';
import { load } from 'cheerio';

export const environmentSchema = z.object({
    DISCORD_WEBHOOK_URL: z.string(),
    DISCORD_WEBHOOK_USERNAME: z.string().optional(),
});

const URL = "https://www.vlr.gg/matches";

export type EnvironmentVariables = z.infer<typeof environmentSchema>;
const { DISCORD_WEBHOOK_URL, DISCORD_WEBHOOK_USERNAME } = environmentSchema.parse(process.env);

const hook = new Webhook(DISCORD_WEBHOOK_URL);
if (DISCORD_WEBHOOK_USERNAME) {
    hook.setUsername(DISCORD_WEBHOOK_USERNAME);
}

export const handler: Handler = async (event, context) => {
    const page = await fetchPage();
    const matches = parsePage(page);
    const { live: liveMatches, upcoming: upcomingMatches } = groupMatches(matches);
    const messages = [getMessageForLiveMatches(liveMatches), getMessageForUpcomingMatches(upcomingMatches)];
    await Promise.all(messages.map(async message => {
        await hook.send(message);
    }));

    return {
        statusCode: 200,
        body: "Messages sent."
    };
};

const getMessageForLiveMatches = (matches: LiveValorantMatch[]): MessageBuilder => {
    let embed = new MessageBuilder()
        .setTitle("Live Matches")
        .setAuthor("vlr.gg", "https://www.vlr.gg/img/vlr/logo_header.png", URL)
        .setColor(16711680)
        .setFooter(`${matches.length} live matches`)
        .setTimestamp();

    if (matches.length === 0) {
        embed = embed.setDescription("There are no live matches happening right now.");
        return embed;
    }

    const matchesToInclude = matches.length <= 25
        ? matches : matches.slice(0, 25);

    matchesToInclude.forEach(match => {
        embed = embed.addField(`${match.team1.name}(${match.team1.score}) vs ${match.team2.name}(${match.team2.score})`, `${match.event.name}\n${match.event.series}`, true);
    });

    return embed;
}

const getMessageForUpcomingMatches = (matches: UpcomingValorantMatch[]): MessageBuilder => {
    let embed = new MessageBuilder()
        .setTitle("Upcoming Matches")
        .setAuthor("vlr.gg", "https://www.vlr.gg/img/vlr/logo_header.png", URL)
        .setColor(65280)
        .setTimestamp();

    const matchesToInclude = matches.length <= 25
        ? matches : matches.slice(0, 25);

    matchesToInclude.forEach(match => {
        embed = embed.addField(`${match.team1.name} vs ${match.team2.name}`, `Starting in **${match.upcomingTime}**\n${match.event.name}\n${match.event.series}`, true);
    });

    return embed;
}

const fetchPage = async () => {
    const response = await axios.get(URL, {
        responseType: 'text',
        validateStatus: null,
    });
    console.log(`Page fetch status: ${response.status}`);
    return response.data;
}

type ValorantMatchBase = {
    team1: {
        name: string;
    };
    team2: {
        name: string;
    };
    time: string;
    event: {
        name: string;
        series: string;
    }
}

type LiveValorantMatch = ValorantMatchBase & {
    status: "live";
    team1: {
        name: string;
        score: number;
    };
    team2: {
        name: string;
        score: number;
    };
}

type UpcomingValorantMatch = ValorantMatchBase & {
    status: "upcoming";
    upcomingTime: string;
}

type ValorantMatch = LiveValorantMatch | UpcomingValorantMatch;

const groupMatches = (allMatches: ValorantMatch[]): { live: LiveValorantMatch[]; upcoming: UpcomingValorantMatch[] } => {
    const liveMatches: LiveValorantMatch[] = [];
    const upcomingMatches: UpcomingValorantMatch[] = [];
    allMatches.forEach(match => {
        if (match.status === "live") {
            liveMatches.push(match);
        } else {
            upcomingMatches.push(match);
        }
    });
    return { live: liveMatches, upcoming: upcomingMatches };
}

const parsePage = (page: string): ValorantMatch[] => {
    const matches: ValorantMatch[] = [];
    const $ = load(page);
    $("a.match-item").each((i, el) => {
        const teams = $(el).find("div.match-item-vs-team-name > div.text-of").map((_, el) => $(el).text().trim()).toArray();
        const time = $(el).find("div.match-item-time").text().trim() + " PST";
        const seriesName = $(el).find("div.match-item-event-series").text().trim();
        const eventName = $(el).find("div.match-item-event").children().remove().end().text().trim();
        const valorantMatchBaseInformation: ValorantMatchBase = {
            team1: {
                name: teams[0]
            },
            team2: {
                name: teams[1]
            },
            time,
            event: { name: eventName, series: seriesName }
        };

        const isLive = $(el).find("div.match-item-eta > div > div.ml-status").text().trim() === "LIVE";
        if (isLive) {
            const scores = $(el).find("div.match-item-vs-team-score").map((_, el) => parseInt($(el).text().trim())).toArray();
            matches.push({
                ...valorantMatchBaseInformation,
                status: "live",
                team1: {
                    ...valorantMatchBaseInformation.team1,
                    score: scores[0]
                },
                team2: {
                    ...valorantMatchBaseInformation.team2,
                    score: scores[1]
                }
            });
        } else {
            const upcomingTime = $(el).find("div.match-item-eta > div > div.ml-eta").text().trim();
            matches.push({
                ...valorantMatchBaseInformation,
                status: "upcoming",
                upcomingTime
            });
        }
    });
    return matches;
}

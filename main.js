import fetch from 'node-fetch';
import fs from 'fs';
import chalk from 'chalk';
import { banner } from './utils/banner.js';
import { logger } from './utils/logger.js';
import getToken from './getToken.js';

const getRandomQuality = () => {
    return Math.floor(Math.random() * (99 - 60 + 1)) + 60;
};

const getTokens = () => {
    return fs.readFileSync('token.txt', 'utf8').split('\n').map(line => line.trim()).filter(Boolean);
};

const shareBandwidth = async (token) => {
    const quality = getRandomQuality();
    const maxRetries = 5;
    let attempt = 0;

    while (attempt < maxRetries) {
        try {
            const response = await fetch('https://api.openloop.so/bandwidth/share', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ quality }),
            });

            if (!response.ok) {
                throw new Error(`Failed to share bandwidth! Status: ${response.statusText}`);
            }

            const data = await response.json();

            if (data && data.data && data.data.balances) {
                const balance = data.data.balances.POINT;
                logger(
                    `Bandwidth shared Message: ${chalk.yellow(data.message)} | Score: ${chalk.yellow(quality)} | Total Earnings: ${chalk.yellow(balance)}`
                );
            }
            return;
        } catch (error) {
            attempt++;
            if (attempt >= maxRetries) {
                logger(`Max retries reached. Skipping.`, 'error');
            } else {
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        }
    }
};

let intervalId;

const checkMissions = async (token) => {
    try {
        const response = await fetch('https://api.openloop.so/missions', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });

        if (response.status === 401) {
            logger('Token is expired. Trying to get a new token...', 'warn');
            clearInterval(intervalId);

            await getToken();
            restartInterval();
            return null;
        } else if (!response.ok) {
            throw new Error(`Failed to fetch missions! Status: ${response.statusText}`);
        }

        const data = await response.json();
        return data.data;
    } catch (error) {
        logger('Error Fetching Missions!', 'error', error);
    }
};

const restartInterval = () => {
    intervalId = setInterval(shareBandwidthForAllTokens, 60 * 1000);
};

const shareBandwidthForAllTokens = async () => {
    const tokens = getTokens();

    for (const token of tokens) {
        try {
            const response = await checkMissions(token);
            if (response && Array.isArray(response.missions)) {
                const availableMissionIds = response.missions
                    .filter(mission => mission.status === 'available')
                    .map(mission => mission.missionId);

                logger('Available Missions:', 'info', availableMissionIds.length);
                for (const missionId of availableMissionIds) {
                    logger(`Do and complete mission Id: ${missionId}`, 'info');
                    const completeMission = await doMissions(missionId, token);
                    logger(`Mission Id: ${missionId} Complete: ${completeMission.message}`);
                }
            }
        } catch (error) {
            logger('Error checking missions:', 'error', error);
        }

        try {
            await shareBandwidth(token);
        } catch (error) {
            logger(`Error processing token: ${token}, Error: ${error.message}`, 'error');
        }
    }
};

const doMissions = async (missionId, token) => {
    try {
        const response = await fetch(`https://api.openloop.so/missions/${missionId}/complete`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to Complete Missions! Status: ${response.statusText}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        logger('Error Complete Missions!', 'error', error);
    }
};

const main = () => {
    logger(banner, 'debug');
    logger('Starting bandwidth sharing each minute...');
    shareBandwidthForAllTokens();

    intervalId = setInterval(shareBandwidthForAllTokens, 60 * 1000);
};

main();

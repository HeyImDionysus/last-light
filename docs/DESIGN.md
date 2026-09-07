# Last Light — shipped design

## Identity

A restrained, stylized 3D forest fantasy: cold coastal air, warm portable light, old brass, worn stone, and a hooded keeper. This edition changes the old short browser round into a finite exploration adventure. It does not attempt photorealism or present a 2D renderer as 3D.

The lighthouse remains the central home landmark. Three regions form separate excursions with readable paths and intervening wilderness. There are forty fixed stars, more than the twenty needed, so the player can choose routes rather than exhaust the map. A five-star satchel rewards planning return journeys. Eight journal pages develop the setting and explain its mechanisms without requiring an external guide.

## Campaign states

Title → new/continue → exploration and restoration → last watch → dawn/ending → continued exploration or replay. Pause, settings, survey, journal, credits, defeat, and checkpoint retry are implemented states rather than stand-in screens.

The Bellwood tests ordered observation and interaction. The Drowned Cloister tests spatial alignment, with gold/blue markers and visible light links. The Ashen Crown combines sustained aiming, position, resource management, guardian attack telegraphs, and pulse timing. The finale is a short, navigational ritual under pressure, not another collection quota.

No door-swipe loop, firearm auto-attack, loot treadmill, monetization, login, multiplayer, or live-service dependency is present. The player keeps meaningful control over route, lantern use, and danger exposure. A restored ward changes the practical map by creating a new safe checkpoint.

## Rules

| System | Implemented rule |
|---|---|
| Objective | 20 banked stars plus all three restored wards, followed by the last watch |
| Available collectibles | 40 stars and 8 journal pages |
| Carry limit | 5 stars; bank at the lighthouse |
| Health / resources | 3 health, 100 light, 100 stamina |
| Movement | 4.25 m/s walking, 6.7 sprinting, 2.75 focusing; accelerated motion, native collision |
| Pulse | 18 light; 2.3-second cooldown; clear line of sight; range 7.8 m |
| Dodge | 24 stamina; short invulnerability and cooldown |
| Seals | Focus within 10 m and clear sight for about 3.4 seconds per seal |
| Guardian | Unseal three stones, then connect three pulses; attacks have a visible windup |
| Last watch | 90 seconds; 120 on Story; three braziers, then lighthouse interaction |
| Failure | Recoverable checkpoint retry; no permanent campaign loss |
| Completion | Ending and saved peaceful dawn exploration |

Durations are game mechanics, not measured player-completion-time claims. A full human usability and difficulty-balancing study has not been performed. The source separates the relevant constants/rates and includes repeatable tests so further tuning can be made deliberately.

## Content and asset ownership

Models, materials, environmental dressing, character rigs, animation curves, journal prose, UI, and synthesized sounds are original definitions within this repository. System fonts are requested from the host OS with fallback; font files are not bundled. Godot and its incorporated third-party components retain their respective licenses. The build generates complete engine notices from the exact engine and ships them beside the game. This document does not apply a new open-source license to the repository owner's game IP.

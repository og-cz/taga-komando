<img src="docs/logo.svg" alt="Taga Komando" width="420">

### Pinakabagong Bersiyon <a href="https://github.com/og-cz/taga-komando/releases/latest"><img src="https://img.shields.io/github/v/release/og-cz/taga-komando?style=for-the-badge&color=green" align="top"></a>
[![Downloads](https://img.shields.io/github/downloads/og-cz/taga-komando/total?label=Downloads&color=6b5b3a)](https://github.com/og-cz/taga-komando/releases) [![Platform](https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011-0078D6)](#mga-kailangan-ng-computer) [![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/) [![Electron](https://img.shields.io/badge/Electron-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/) [![Single player](https://img.shields.io/badge/Single%20player-Offline-556b2f)](#mga-mode-ng-laro)
##### [English](README.md) | **Tagalog**
----

Larong taktika na real-time para sa Windows, gamit ang mga iskuwad, sa Luzon.

Bersiyon 0.7.0 · Kampanya, Teatro ng Digmaan at Skirmish laban sa AI · Offline

<picture>![Taga Komando](docs/screenshot.jpg)</picture>
<sub>Konsepto ng itsurang patutunguhan ng laro.</sub>

---

## Saan makukuha

- **Ang laro (Windows):** [Pahina ng mga release](https://github.com/og-cz/taga-komando/releases)
  - `TagaKomando-Setup-<version>.exe`: installer (shortcut sa Start menu, may uninstaller)
  - `TagaKomando-Portable-<version>.exe`: iisang file, walang install, tumatakbo kahit saan
- **Source code:** https://github.com/og-cz/taga-komando
- **Node.js 22 pataas** (kailangan lang kung ibi-build mula sa source): https://nodejs.org (piliin ang "LTS")
- **Git** (kailangan lang kung ibi-build mula sa source): https://git-scm.com/downloads
- **Ulat ng bug / mungkahi:** https://github.com/og-cz/taga-komando/issues

## Mga kailangan ng computer

- Windows 10 o 11, 64-bit
- 4 GB RAM
- 400 MB na espasyo sa disk
- Screen na 1280×720 o mas malaki
- Mouse na may kanang pindutan (opsiyonal ang gitna)

## Pag-install

**Installer:** patakbuhin ang `TagaKomando-Setup-<version>.exe`, pumili ng folder, tapusin. Buksan mula sa Start menu.

**Portable:** ilagay ang `TagaKomando-Portable-<version>.exe` kahit saan at i-double-click.

**Babalang "Windows protected your PC":** hindi pa naka-code-sign ang app. I-click ang **More info → Run anyway**.

**Pag-uninstall:** Settings → Apps → Taga Komando → Uninstall. Sa portable: burahin lang ang file.

## Mga mode ng laro

Pumili ng mode sa pangunahing menu.

**Kampanya**: ang pagtatanggol at pagpapalaya sa Luzon, sa mata ng isang kompanya. Siyam na misyon sa apat na kabanata, bawat isa ay may dalawang bahagi, at may mga eksena ng kuwento bago ang bawat bahagi (laktawan gamit ang Esc). Ipanalo ang Bahagi 1 para mabuksan ang Bahagi 2, at pareho para mabuksan ang susunod na misyon.

| # | Kabanata | Misyon | Bahagi 1 | Bahagi 2 |
| --- | --- | --- | --- | --- |
| 1 | The Invasion | The Beaches of Lingayen | Stand at the Plaza (depensa) | Break Contact (lipulin) |
| 2 | The Invasion | Withdrawal to Bataan | The Calumpit Bridges (lipulin) | Plaridel Crossroads (puntos) |
| 3 | The Invasion | Rearguard | The Walled City (depensa) | The Last Bridge at Guagua (depensa) |
| 4 | The Invasion | The Door to Bataan | Delaying Action at Lubao (puntos) | Layac Junction (depensa) |
| 5 | Bataan | The Abucay Line | Hold the Line (depensa) | Counterattack at Pilar (opensiba) |
| 6 | Bataan | The Fall of Bataan | Mount Samat (depensa) | The Last Boats (depensa) |
| 7 | The Hills | Mga Gerilya | Raid on Porac (lipulin) | Ambush at Dinalupihan (puntos) |
| 8 | Liberation | The Return | Back to Lingayen (opensiba) | The Road to Manila (opensiba) |
| 9 | Liberation | San Fernando | Take the Town (opensiba) | The Counterattack (depensa) |

**Teatro ng Digmaan**: apat na operasyong maaaring ulitin sa anumang hirap. Manalo sa Easy, Normal at Hard para sa medalyang Bronse, Pilak at Ginto.

- **Defend the City** (Depensa ng Lungsod): ipagtanggol ang Plaza de Roma sa loob ng mga pader ng Intramuros laban sa 8 alon na dumarating sa tatlong tarangkahan.
- **Hold the Summit** (Depensa ng Burol): ipagtanggol ang tuktok ng burol laban sa 8 alon.
- **Highway 3 Assault** (Salakay sa Highway): wasakin ang 4 na pinatibay na posisyon sa kahabaan ng highway bago maubos ang oras.
- **Battle for Luzon** (Makasaysayang Skirmish): isang buong labanan sa makasaysayang lugar, sa kondisyon ng tagumpay na pipiliin mo.

**Skirmish**: laban sa AI sa mapang pipiliin mo, sa kondisyon ng tagumpay na pipiliin mo:

- **Capture Points:** ang paghawak ng mas maraming victory point ay umuubos sa 500 tiket ng kalaban.
- **Annihilation:** lipulin ang buong hukbo ng kalaban (bawat yunit, wala nang ginagawa).
- **None:** walang tiket at walang hangganang oras.

Anuman ang kondisyon, laging panalo ang pagwasak sa punong himpilan ng kalaban.

Paano gumagana ang mga uri ng misyon:

- **Depensa:** hawakan ang may markang punto na **HOLD**. Dumarating ang mga alon ayon sa oras at lumalakas. Talo ka kapag bumagsak ang punto.
- **Opensiba:** sakupin nang sunod-sunod ang mga sektor na may markang **OBJECTIVE**. Bawat isa ay nagdadagdag ng 3 minuto at inuusad ang lugar ng iyong reinforcement. Gaganti ang kalaban.
- **Labanan / Skirmish:** napapanalunan sa piniling kondisyon (Capture Points, Annihilation o None).

## Paano maglaro

1. Pumili ng mode, saka ng misyon o mapa at ng hirap, saka pindutin ang **Deploy**.
2. Sakupin ang mga punto gamit ang impanterya. Hindi nakakasakop ang mga sasakyan.
3. Tapusin ang layunin ng misyon na nakasaad sa itaas ng screen.
4. Laging panalo ang pagwasak sa HQ ng kalaban; laging talo kapag nawala ang sa iyo.

**Mga rekurso**

- **Manpower (MP):** pambuo at pampuno ng mga yunit. Galing sa base; lumalaki ang gastos habang lumalaki ang hukbo.
- **Munitions (MU):** mga granada at barrage. Galing sa mga munitions point (**M**).
- **Fuel (FU):** mga tangke. Galing sa mga fuel point (**F**).
- Nagbabayad lang ang punto habang nakakonekta ito sa iyong HQ sa pamamagitan ng teritoryong hawak mo. Putol ang puntong may guhit sa gitna.

**Kubli** (ipinapakita ng mga tuldok sa ilalim ng cursor kung saan tatayo ang mga sundalo):

- Berde = matibay na kubli (sandbag, pader na bato, gusali)
- Dilaw = magaang kubli (hedgerow, hukay ng bomba, gubat)
- Pula = lantad (mas madaling tamaan ang mga sundalo sa palayan)
- Pinoprotektahan lang ng kubli laban sa putok mula sa kabilang panig nito.

**Pagbuo ng hukbo** (gaya ng tunay na kompanya, pinaghihirapan ang mabibigat na armas):

- Nagsisimula ang bawat labanan sa **isang iskuwad ng inhinyero**. Mula sa simula, nakakapag-recruit ang punong himpilan ng **riflemen at inhinyero**.
- Nagtatayo ang mga inhinyero ng **tier building** mula sa menu ng **Base** (**W**), tig-iisa:
  - **Tier 1 · Support Command** (150 MP, 15 FU): mga machine gun at mortar team, upgrade na BAR / light MG.
  - **Tier 2 · Anti-Tank Command** (180 MP, 40 FU, kailangan ang Tier 1): bazooka / AT rifle team, upgrade na anti-tank rifle.
  - **Tier 3 · Motor Pool** (200 MP, 80 FU, kailangan ang Tier 2): mga tangke.
- Piliin ang isang tier building para mag-recruit ng mga yunit nito roon mismo (lalabas sila sa pinto nito); kahit anong nabuksan na ay mare-recruit ng punong himpilan. Kapag nawala ang isang tier building, hindi mare-recruit ang mga yunit nito hanggang maitayo itong muli. Bukas na ang lahat sa simula ng mga misyong depensa at salakay.
- Napupunan lang ang iskuwad kapag **malapit sa base**: punong himpilan, tier building o bunker. Lumalakad palabas ng base na iyon ang mga bagong sundalo para sumama sa kanila.
- Sinasakop ng mga gusali ang tunay nitong lupa (MG nest, bunker at aid station 2×2 na tile, tier building 3×2), na ipinapakita habang inilalagay. Sa harap lang pumuputok ang MG nest (120°) at bunker (90°): **i-drag** habang inilalagay para piliin kung saan ito haharap.

**Mga payo**

- Pinapadapa ng machine gun ang impanterya sa loob ng saklaw ng putok nito. Lumigid o maghagis ng granada.
- Kailangan ng mortar ng kakampi na nakakakita sa target.
- Manipis ang baluti sa likod ng mga tangke. Tamaan sila mula sa likuran.
- Pa-urungin (**R**) ang mga sugatang iskuwad bago sila maubos, saka punan (**E**) sa HQ. Hindi na mababawi ang pag-urong: walang ibang utos na susundin ang iskuwad hanggang makauwi. Hindi umuurong ang mga tangke: imaneho sila pabalik at ipaayos sa mga inhinyero.
- Pinatitibay ng mga inhinyero ang lupa mula sa menu ng **Build** (**Q**): matibay na kubli ang sandbag, pinipigil ng barbed wire ang impanterya (dinudurog ito ng tangke), pinipigil ng tank trap ang mga tangke, sumasabog ang mina sa sinumang tumapak, pumuputok ang MG nest, may machine gun ang bunker at doon makakapuno ang mga iskuwad, at nagpapagaling ng mga sundalo sa malapit ang aid tent. Nag-aayos din ang mga inhinyero ng tangke, istruktura at HQ.
- Bigyan ang isang rifle squad ng isang upgrade ng armas (**T / Y**) malapit sa HQ: bazooka o AT rifle laban sa tangke, BAR o light MG laban sa impanterya.

## Mga kontrol

| Key / mouse | Gawain |
| --- | --- |
| Left-click / drag | Pumili ng mga yunit (Shift para magdagdag; double-click para piliin ang parehong uri) |
| Right-click | Lumipat, o salakayin ang kalabang nasa ilalim ng cursor (Shift para ipila) |
| Right-click + drag | Pumunta roon at humarap sa direksiyon ng drag. Doon nakatutok ang machine gun at mortar team pag nag-set up; lumalabas ang saklaw ng putok habang nagda-drag |
| A | Attack-move |
| S | Tigil |
| R | Umurong sa HQ |
| E | Punan |
| D | I-set up / ligpitin ang machine gun at mortar team (lumalabas ang saklaw ng putok; i-click para itutok) |
| G | Granada |
| B | Barrage ng mortar |
| Q | Inhinyero: buksan ang menu ng Build (Esc para isara) |
| W | Inhinyero: buksan ang menu ng Base: Z / X / C para itayo ang Tier 1 / Tier 2 / Tier 3 |
| Z / X / C / V | Menu ng Build: sandbag / barbed wire / tank trap / mina (i-drag para sa isang hanay; Shift para tuloy-tuloy) |
| B / N / M | Menu ng Build: MG nest / bunker / aid tent |
| F, saka i-click ang sirang tangke, HQ o depensa | Aayusin ito ng mga inhinyero (gumagana rin ang right-click) |
| Right-click sa hindi pa tapos na depensa | Tutulong sa pagtatayo ang mga napiling inhinyero |
| I-click ang depensa o mina | Ipakita ang buhay at detalye nito |
| T / Y | Upgrade ng armas para sa napiling rifle squad (malapit sa HQ o puntong may suplay) |
| H | Piliin ang HQ (sa right-click ay ililipat ang rally flag) |
| Ctrl + 1–9 / 1–9 | Magtakda / pumili ng control group (i-double-tap para tumalon) |
| Space | Pindot: isentro sa napili. Diinan + left-drag: hilahin ang mapa |
| Arrow keys, gilid ng screen, middle-drag | Mag-scroll |
| Mouse wheel | Mag-zoom |
| F11 o Alt+Enter | Fullscreen |
| Esc o P | Menu ng pause |
| F1 | Mga kontrol |

## Mga yunit

| Tungkulin | Hukbong Maharlika | Imperial Army |
| --- | --- | --- |
| Rifle squad | Sundalo ng Maharlika: 5 lalaki, granada; upgrade na Kanyong Balikat o Ripleng Awtomatiko | Teikoku Hohei: 6 lalaki, granada; upgrade na Type 99 LMG o AT rifle |
| Inhinyero | Inhinyero ng Maharlika | Teikoku Kōhei |
| Machine gun | Ametralyadora ng Maharlika | Teikoku Kikanjū-han |
| Mortar | Mortero ng Maharlika | Teikoku Hakugeki-han |
| Anti-tank | Pangontra-Tangke ng Maharlika | Teikoku Taisensha-han |
| Tangke | Tangke Tamaraw | Teikoku Sensha Chi-Ha |

### Mga doktrina

Pumipili ang bawat hukbo ng isang doktrina bawat labanan. Nagdadagdag ito ng espesyal na yunit at dalawang call-in ng komandante na nabubuksan gamit ang command points (nakukuha sa labanan).

| Hukbong Maharlika | Imperial Army | Estilo | Espesyal na yunit |
| --- | --- | --- | --- |
| Hukbo ni Heneral Luna (Heneral Antonio Luna) | Kirikomi Butai (Homma Masaharu) | Kidlat na salakay | Shock infantry na may submachine gun |
| Katipunan (Andrés Bonifacio) | Kokumin Giyūtai (Saigō Takamori) | Hukbo ng bayan | 10-kataong milisya na may itak at lumang riple |
| Tanggulang Bayan (Vicente Lim) | Bōgyo Jinchi (Yamashita Tomoyuki) | Malalim na depensa | Anti-tank gun team |
| Hukbong Himpapawid (Jesús Villamor) | Teishin Shūdan (Yamamoto Isoroku) | Mula sa himpapawid | Paracaidista (ibinababa rin sa call-in) |
| Gerilya (Miguel Malvar) | Yūgeki-tai (Sakamoto Ryōma) | Digmaang gerilya | Mga nakakubling infiltrator |

**Mga mapa:**
- Skirmish: Bataan Crossroads, Barrio San Roque, at labintatlong bayan sa Luzon: Calumpit, Plaridel, Pilar, Orani, Porac, Abucay, San Fernando, Dinalupihan, Hermosa, Guagua, Lingayen, Baliuag at Lubao (mga bayang may ilog, baybayin, gubat at bukas na sakahan).
- Mga misyon: Intramuros (napapaderang lungsod sa tabi ng look), Bundok Samat, Ruta 3 at Layac Junction, pati ang Calumpit at San Fernando para sa mga bukas na labanan.

## Changelog

Nasa [bersiyong Ingles](README.md#changelog) ang buong talaan ng mga pagbabago.

## Pagkilala

- Mga mapa ng bayan: ginawa gamit ang **Village Generator** ni Watabou (https://watabou.itch.io/village-generator) at **Medieval Fantasy City Generator** (https://watabou.itch.io/medieval-fantasy-city-generator) at ginawang larangan ng labanan. Malayang magagamit ang mga mapa ni Watabou; salamat.
- Mga sound effect (lahat CC0, mula sa OpenGameArt): **The Free Firearm Sound Library** (putok ng baril), "25 CC0 bang / firework SFX" ni rubberduck, "Explosions" ni EZduzziteh, "Cannon fire" at "Cannon hit" ni Thimras, "Generator (loop)" ni YCbCr, "Rocket launch" ni qubodup.
- Tunog ng interface at mga yunit (CC0, mula sa OpenGameArt): "Typewriter sounds" ni Cassie-OrbitGames, "Crank movie telephone ringtone" ni cyberdyne, "Mechanical Sounds" ni BMacZero, "Equipment Clicks II" at "equipment clicks III" ni LFA, "Car engine start 01" ni looneybits.
- Musika: "Triumphant" ni Emma_MA (tagumpay) at "The Sad Battle" ni Eldritch Grim (pagkatalo), parehong CC0 mula sa OpenGameArt; "Laments of the War" ni Cethiel (mga menu, CC0, mula sa OpenGameArt) at "Five Armies" ni Kevin MacLeod (incompetech.com) para sa labanan, sa ilalim ng Creative Commons: By Attribution 4.0 (https://creativecommons.org/licenses/by/4.0/). Kasama ng laro ang parehong pagkilala sa `licenses/Music-credits.txt`.
- Font na pang-display: **Quiapo Free** ni Aaron Amar (http://be.net/aaronamar), ginamit sa ilalim ng SIL Open Font License 1.1. Kasama ng laro ang teksto ng lisensiya sa `licenses/Quiapo-OFL.txt`.

## Pag-aayos ng problema

- **Blangko ang window pagbukas:** i-update ang graphics driver, saka buksang muli ang laro.
- **Mabagal ang laro:** isara ang ibang mabibigat na programa at i-update ang graphics driver.
- **Hindi tumutugon ang keyboard:** i-click minsan sa loob ng window ng laro.
- **Bumabalik sa dati ang mga pinili sa menu:** awtomatikong nase-save ang huling paksiyon, mapa at hirap; normal ito pagkatapos mag-reinstall.

---

## Pag-build mula sa source

Kailangan ang Node.js at Git (tingnan ang [Saan makukuha](#saan-makukuha)).

```bash
git clone https://github.com/og-cz/taga-komando.git
cd taga-komando
npm install
```

Kung nilaktawan ng npm ang pag-download ng Electron, kunin ang runtime nang isang beses:

```bash
node node_modules/electron/install.js
```

| Utos | Resulta |
| --- | --- |
| `npm run app` | I-build at buksan ang laro sa desktop window |
| `npm run dist` | Gawin ang installer at portable na `.exe` sa `release/` |
| `npm run dev` | Development server na may live reload (bubukas sa browser) |
| `npm test` | Patakbuhin ang mga test ng lohika ng laro, kasama ang buong laban ng AI laban sa AI |
| `npm run typecheck` | Suriin ang mga uri (type) sa code |

**Ayos ng proyekto**

```
electron/   desktop window
src/data/   lahat ng numero ng yunit, armas, mapa at balanse (baguhin ang mga ito para magbalanse)
src/sim/    mga patakaran ng laro: galaw, labanan, kubli, suppression, paningin, teritoryo, ekonomiya
src/ai/     kalabang computer
src/render/ pagguhit
src/ui/     mga menu at HUD
src/input/  mouse at keyboard
tests/      mga awtomatikong test
tools/      pang-convert ng mapa mula sa Watabou village export
```

**Pagdagdag ng mapa ng bayan**

1. Buksan ang https://watabou.github.io/village-generator/, gumawa ng nayong gusto mo, saka i-right-click ang mapa → *Export as* → *JSON*.
2. Sa parehong pahina, buksan ang console ng browser, i-paste ang `tools/watabou-to-grid.js`, at patakbuhin ang `copy(JSON.stringify(watabouToGrid(<ang na-export na JSON>)))`.
3. I-save ang mga hilera sa `src/data/luzon/<bayan>.ts` at magdagdag ng entry para sa bayan sa `src/data/luzonMaps.ts` (pangalan, paglalarawan, pangalan ng mga punto).
4. Patakbuhin ang `npm test`. Awtomatikong inilalagay ang mga base at capture point, at sinusuri ng mga test na maaabot ng impanterya at tangke ang bawat punto mula sa parehong base.

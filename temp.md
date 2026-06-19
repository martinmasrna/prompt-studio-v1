# Poker Game Theory — skriptá pre seriózny predmet (verzia 1.1)

## Úvod a predmet štúdia
Poker (v týchto skriptách najmä No‑Limit Hold’em) je modelový príklad sekvenčnej hry s neúplnou informáciou a náhodou, v ktorej sa racionálne rozhodovanie opiera o teóriu hier, pravdepodobnosť a štatistickú inferenciu. Každé rozhodnutie hráča vzniká v tzv. informačnom stave, ktorý tvorí pozorovateľná časť (karty na boarde, výška potu, priebeh akcií v uliciach) a skrytá časť (hole cards súperov). Rozhodnutia sa realizujú v poradí a sú prekladané „chance uzlami“ (rozdávanie kariet); z pohľadu výplat ide prakticky o hru s nulovým súčtom: očakávaný zisk jedného je očakávaná strata druhého, abstrahujúc poplatky. Cieľom tejto kapitoly je poskytnúť študentovi súvislý rámec: od základných kvantitatívnych nástrojov (pot odds, equity, EV, MDF), cez prácu s rozsahmi rúk (range, combinatorics, blockers, board/nut advantage), až po strategické princípy (tvar stávok, SPR, GTO vs. exploit) a špecifiká turnajovej hry (ICM).

## Formálny model a pojem „range“
Pri riešení hier s neúplnou informáciou nedáva zmysel pýtať sa „akú presnú ruku má súper“, ale „aké rozdelenie rúk môže mať vzhľadom na jeho doterajšie akcie“. Tento súbor pravdepodobností nazývame range. Range sa mení s každou informáciou: s preflop akciou, s textúrou flopu, s veľkosťou a typom stávky na turne či rivery. Dve dôležité vlastnosti boardu sú board advantage (ktorá strana zasiahla typicky silnejšie kategórie rúk na danej textúre) a nut advantage (ktorá strana má väčšiu hustotu absolútne najsilnejších kombinácií). Hráč s nut advantage si štandardne môže dovoliť polarizovanejšie línie a väčšie sizingy, pretože jeho silná časť range je ťažšie domysliteľná a drahšie odolná.

## Základné kvantitatívne pojmy: pot odds, equity, EV
Pot odds vyjadrujú, akú „cenu“ platíme za možnosť získať pot. Ak čelíme stávke veľkosti b do potu p (po vklade súpera, pred naším rozhodnutím), tzv. break‑even equity pre call je `b / (p + b)`. Ak je naša odhadovaná equity voči súperovej stávkujúcej range aspoň takto vysoká, call je — pri absencii ďalších streets a side‑informácií — neutrálny až ziskový. Očakávaná hodnota (EV) je vážený priemer výsledkov: pri jednokrokovom rozhodnutí na riveri má fold EV = 0; call vyhrá s pravdepodobnosťou rovnou našej equity a získa `p + b`, prehrá a stratí `b`; raise vytvára nový pot a nové pravdepodobnosti. V praxi nejde o presné počítanie, ale o ukotvenie intuície v správnych prahoch (napr. call vyžadujúci 33 % equity nefoldovať, ak máme voči polarizovanej range ~40 %).

## Obrana proti polarizovaným stávkam: Minimum Defense Frequency (MDF)
Ak útočník stávkuje polarizovane (value + bluffy bez showdown value), existuje minimálne percento obrany, pri ktorom je „auto‑bluff“ bezcenný: `MDF = p / (p + b)`. Ak obranca folduje viac než (1 − MDF) svojej range, útočník môže zarábať slepým bluffom. MDF je objemové pravidlo: hovorí, koľko z range brániť, nie ktoré konkrétne kombinácie. Výber kombinácií riadia blockery a realizácia equity.

## Indiferenčný princíp na riveri a pomer value : bluffy
Na poslednej ulici (bez ďalších kariet) odvodíme povolený podiel bluffov v bet range z princípu indiferencie: aby bol obranca indiferentný medzi callom a foldom, musí platiť pomer `bluffy : value = b / (p + b)`. Väčší sizing → viac povolených bluffov (polarizácia); menší sizing → tenšie value, málo bluffov. Príklady: pot 100, bet 100 → ~1 bluff na 2 value; pot 100, bet 50 → ~1 bluff na 3 value.

## Kombinatorika a blokátory
Rozhodovanie „range vs. range“ je kombinatorické. AKo má v plnom balíku 12 kombinácií, AKs 4; každá karta na boarde alebo v našej ruke tieto počty redukuje. Blockers sú karty, ktoré znižujú počet kombinácií v súperovej value alebo bluff časti. Držať A♠ na boarde s možnou spade flush znamená menej súperových value flushí; držať typické bluff karty (napr. Q♠, keď súperove bluffy pochádzajú z Q‑high spade ťahov) naopak znižuje jeho bluffy a posúva nás k častejšiemu foldu.

## Tvar stávok: polarizované a lineárne spektrá
Polarizované spektrum obsahuje extrémy (nuts + bluffy) a využíva väčšie sizingy, kde teória povoľuje vyšší podiel bluffov. Lineárne (merged) spektrum zhromažďuje stredne silné až silné ruky, ktoré chcú byť platené široko; používa menšie sizingy a nízky podiel bluffov. Výber tvaru závisí od board/nut advantage: na suchom A‑high PFR často stávkuje často a menšie; na J‑T‑9 má obranca veľa silných rúk, preto PFR spomaluje, polarizuje a prijíma viac checkov.

## SPR a plánovanie veľkosti potu
Stack‑to‑Pot Ratio (SPR) určuje, ktoré triedy rúk chcú budovať veľké poty. Nízke SPR (≈ ≤3) zvýhodňuje top pair/overpair a jednoduché value línie; vysoké SPR zvýhodňuje potenciálne kombinácie (nut draws, sety), ktoré ťažia z implied odds. S TPTK bez redrawov OOP pri SPR 6–8 typicky neplánujeme „stack‑off“ v dvoch streets; skôr kontrolu potu a disciplinované foldy proti silnej agresii.

## Realizácia equity a pozícia
„Papierová“ equity sa nerovná realizovanej hodnote. Out‑of‑position hráč realizuje equity horšie (častejšie musí folduť na neskoršie stávky), zatiaľ čo in‑position rozhoduje posledný a lepšie premieňa ťahy na showdown alebo úspešný bluff. Z toho plynú rozdiely v call downoch a frekvenciách agresie medzi IP a OOP.

## C‑bet, check‑raise a textúry boardu
C‑bet nie je automatický; závisí od výhod v range a schopnosti reprezentovať silu v ďalších uliciach. Na esových, suchých textúrach má PFR často výraznú výhodu a stávkuje často s menším sizingom. Na prepojených, „ťažkých“ boardoch je racionálne spomaliť, polarizovať a vyberať bluffy s backdoor equity a priaznivými blockermi. Check‑raise (z pohľadu obrancu) je polarizovaný nástroj: buduje pot s hornou časťou spektra a generuje fold equity so slabšou časťou (bluffy s redrawmi).

## Rovnovážna hra (GTO) a exploit
GTO je poistka proti dlhodobému exploitu; exploit je vedomé odchýlenie na trestanie tendencií súpera (overfold/overcall/over‑bluff/under‑bluff). Proti neznámym/reg hráčom sa opierame o solverové baseline; keď identifikujeme tendenciu, meníme frekvencie a sizingy konzistentne s našou value časťou, aby sme sami neboli ľahko zraniteľní.

## River ako laboratórium presných výpočtov
Na riveri sa strom uzatvára, nevznikajú nové karty a možno presne uvažovať o MDF, pomere value : bluffy a blockeroch. Proti veľkým, polarizovaným sizingom bránime aspoň MDF a výber kombinácií upravujeme podľa toho, či blokujeme value (call viac) alebo bluffy (call menej). Držanie A♠ na spade boarde je klasický dôvod na častejší call; držanie typických bluff kariet súpera naopak na fold.

## Preflop kostra: open, 3‑bet/4‑bet, izolácia
Otváracie rozsahy rastú s pozíciou vďaka lepšej realizácii equity. Proti neskorým otvoreniam lineárnejšie bránime (call/3‑bet) na blindoch; proti skorým pozíciám polarizujeme 3‑bety (value + Axs/Kxs s blockermi). Izolačné raisy proti limpom zväčšujú pot a dávajú iniciatívu; vhodné sú suited broadways, páry, Axs. Nejde o jednu „správnu tabuľku“, ale o pochopenie, prečo daná trieda rúk zarába v danom kontexte.

## Turnajová špecifikácia: ICM a bubble factor
V turnajoch čipy ≠ peniaze lineárne. ICM priraďuje pravdepodobnosti umiestneniam a z toho plynie bubble factor: strata čipov v zónach blízko bubliny bolí viac než rovnako veľký zisk. Prakticky sprísňujeme cally o všetko proti stackom, ktoré nás pokrývajú, a častejšie tlačíme na menšie stacky. Súper, ktorý ICM ignoruje, sa stáva cieľom exploitov v bubble spotoch.

## Výpočtové minipríklady
Pot 120, bet 90 (river). Potrebná equity pre call: `90 / (120 + 90) ≈ 42,9 %`. MDF obrancu: `120 / 210 ≈ 57,1 %`. Indiferenčný pomer bluff:value v našej bet range: `90 / (120 + 90) ≈ 0,429` (≈ 3 bluffy na 7 value).  
Pot 100, súper bet 75, držíme silný blocker na jeho value a neblokujeme prirodzené bluffy. Ak odhad bluffov ≥ ~43 %, call je dlhodobo +EV; ak súper známe „under‑bluffuje“, fold môže byť správny aj s papierovou equity blízkou prahu.

## Metodologická poznámka ku „solverom“
Solverové výstupy sú mapa, nie územie. Malé zmeny vstupov (range, sizingy) menia rovnováhu. Cieľ nie je memorovanie, ale porozumenie: prečo sú vybrané bluffy (blockery, backdoory), prečo sa mení sizing (nut/board advantage), prečo IP realizuje equity lepšie než OOP. Baseline chráni pred veľkými chybami; zisk prichádza z disciplinovaných exploitov, keď súper teóriu nedodržiava.

## Záver
Teória pokru stojí na pilieroch, ktoré sa navzájom podopierajú. Kvantitatívne prahy (pot odds, break‑even equity, MDF a indiferenčné pomery) chránia pred systematickým krvácaním. Pojmy range, kombinatorika a blockery učia myslieť v rozdeleniach, nie v anekdotách. Architektúra stávok (polar vs. lineárne) a plánovanie cez SPR vysvetľujú, kde tlačiť veľkým sizingom a kde vyberať tenké value. Rozlíšenie GTO vs. exploit je kompas: keď nič nevieme, držíme sa mapy; keď vidíme tendenciu, meníme kurz.

## Kontrolné otázky (štýl skúšky)
1. Odvoďte MDF a vysvetlite jej význam pri obrane proti polarizovanému betu.  
2. Prečo sa povolená frekvencia bluffov zvyšuje s veľkosťou betu? Uveďte príklad pre 150 % pot bet.  
3. Vysvetlite vplyv SPR na plánovanie potu s TPTK OOP na mokrom boarde.  
4. Ako mení držaný A♠ vašu call/bluff frekvenciu na boarde so spade flush draw a prečo?  
5. Popíšte rozdiel medzi GTO a exploit prístupom a uveďte spot, kde by ste prepli do exploit režimu.

## Mini‑glosár
Range — rozdelenie možných rúk súpera v danom uzle.  
Blockers/Removal — karty znižujúce počet kombinácií v súperovej value alebo bluff časti.  
MDF — minimum defense frequency; percento bránenej range zabraňujúce auto‑bluff zisku.  
SPR — stack‑to‑pot ratio; pomer efektívneho stacku k potu.  
ICM — model hodnotenia čipov v MTT podľa payoutu.  
Polar/Merged — tvar bet range (extrémy vs. súvislé spektrum).  
Nut/Board advantage — kto drží viac najsilnejších rúk/lepší zásah na danom boarde.
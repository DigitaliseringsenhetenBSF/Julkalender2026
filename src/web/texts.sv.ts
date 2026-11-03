/**
 * All Swedish UI texts in one place so wording can be reviewed by non-developers.
 * Domain terms: lucka, uppdrag, pusselbit, pusslet, tillsammans (see docs/SPEC.md).
 */

const MONTHS = [
  'januari',
  'februari',
  'mars',
  'april',
  'maj',
  'juni',
  'juli',
  'augusti',
  'september',
  'oktober',
  'november',
  'december',
];

/** "2026-12-04" → "4 december" */
export function formatDate(iso: string): string {
  const [, month, day] = iso.split('-').map(Number);
  return `${day} ${MONTHS[(month ?? 1) - 1]}`;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** "2026-12-01", "2026-12-24" → "1–24 december" (or "28 november–3 december"). */
function dateRange(from: string, to: string): string {
  const [, fromMonth, fromDay] = from.split('-').map(Number);
  const [, toMonth] = to.split('-').map(Number);
  return fromMonth === toMonth
    ? `${fromDay}–${formatDate(to)}`
    : `${formatDate(from)}–${formatDate(to)}`;
}

export const sv = {
  appName: 'Miljöjulkalendern',
  orgLine: 'Skolkontoret · Barn- och skolförvaltningen, Lunds kommun',
  skipToContent: 'Hoppa till innehållet',
  signOut: 'Logga ut',
  signedInAs: (name: string) => `Inloggad som ${name}`,
  loading: 'Laddar kalendern …',
  loadError: 'Det gick inte att ladda kalendern. Försök igen om en stund.',
  retry: 'Försök igen',
  simulatedDate: (date: string) => `Testläge: kalendern visar ${formatDate(date)} som idag.`,

  devSignIn: {
    title: 'Logga in',
    lead: 'Testläge: inloggning med ditt Lunds kommun-konto kommer senare. Välj en testanvändare så länge.',
    admin: 'administratör',
    error: 'Inloggningen misslyckades. Försök igen.',
  },

  intro: {
    title: 'Så funkar Miljöjulkalendern',
    items: (o: {
      perPiece: number;
      firstDate: string;
      lastMissionDate: string;
      lastTickOffDate: string;
    }) => [
      `Varje dag ${dateRange(o.firstDate, o.lastMissionDate)} kan du öppna en ny lucka med ett miljöuppdrag. En lucka du har öppnat förblir öppen.`,
      `Gör uppdraget och bocka av det i luckan. Har du missat en dag kan du öppna och bocka av tidigare luckor i efterhand – du har fram till och med ${formatDate(o.lastTickOffDate)} på dig.`,
      `Alla avbockningar på Skolkontoret räknas ihop. Var ${o.perPiece}:e avklarade uppdrag låser upp en ny pusselbit.`,
      'Lägg pusslet själv – dina bitar sparas och ligger kvar nästa gång du kommer tillbaka.',
    ],
  },

  today: {
    heading: 'Dagens uppdrag',
    lucka: (day: number, date: string) => `Lucka ${day} · ${formatDate(date)}`,
    closedDoor: (day: number) => `Dagens lucka är nummer ${day}. Vänd den för att se uppdraget!`,
    openToday: 'Öppna dagens lucka',
    before: (date: string) => `Kalendern öppnar ${formatDate(date)}. Välkommen tillbaka då!`,
    daysLeft: (n: number) => plural(n, 'En dag kvar.', `${n} dagar kvar.`),
    catchUp: (date: string) =>
      `Alla luckor är öppna. Du kan bocka av missade uppdrag till och med ${formatDate(date)}.`,
    leftToDo: (n: number) =>
      n === 0
        ? 'Du har gjort alla uppdrag – tack!'
        : `Du har ${n} ${plural(n, 'uppdrag', 'uppdrag')} kvar att bocka av.`,
    closed: 'Kalendern är stängd. Tack för att du var med och gjorde skillnad!',
    doIt: 'Jag har gjort det!',
    done: 'Avklarat – bra jobbat!',
    undo: 'Ångra',
    undoLabel: (day: number) => `Ångra avbockningen av uppdrag ${day}`,
  },

  progress: {
    heading: 'Tillsammans',
    total: (n: number) => `Tillsammans har vi klarat ${n} uppdrag`,
    remaining: (n: number) => `${n} uppdrag kvar till nästa pusselbit`,
    allUnlocked: 'Alla pusselbitar är upplåsta!',
    pieces: (unlocked: number, total: number) => `${unlocked} av ${total} pusselbitar upplåsta`,
    barLabel: 'Framsteg mot nästa pusselbit',
  },

  puzzle: {
    heading: 'Pusslet',
    lead: 'Dra bitarna från lådorna till rätt plats på bordet. Du kan också välja en bit och sedan en ruta – med mus, finger eller tangentbord.',
    keyboardHelp:
      'Tangentbord: tabba till en bit och tryck Enter. Flytta mellan rutorna med piltangenterna och tryck Enter för att lägga biten. Escape avbryter.',
    empty: (perPiece: number) =>
      `Inga pusselbitar är upplåsta än. Den första kommer efter ${perPiece} avklarade uppdrag!`,
    trayLeft: 'Vänster låda',
    trayRight: 'Höger låda',
    board: (placed: number, total: number) => `Pusselbord, ${placed} av ${total} bitar på plats`,
    where: {
      tray_left: 'i vänster låda',
      tray_right: 'i höger låda',
      board: 'på bordet, inte på rätt plats än',
    },
    pieceLabel: (alt: string, where: string, isNew: boolean) =>
      `Pusselbit: ${alt}, ${where}${isNew ? '. Ny!' : ''}`,
    slotLabel: (row: number, col: number) => `Rad ${row}, kolumn ${col}`,
    slotFilled: 'redan lagd',
    picked: (alt: string) =>
      `Du har valt biten ${alt}. Välj en ruta med piltangenterna och tryck Enter. Escape avbryter.`,
    cancelled: 'Valet avbröts.',
    snapped: (alt: string) => `Rätt! Biten ${alt} sitter nu på plats.`,
    notHere: 'Biten passar inte där. Den ligger kvar på bordet – prova en annan ruta.',
    slotTaken: 'Den rutan är redan lagd. Välj en annan.',
    moved: 'Biten är flyttad.',
    newBadge: 'Ny',
    newPieces: (n: number) =>
      plural(n, 'En ny pusselbit har låsts upp!', `${n} nya pusselbitar har låsts upp!`),
    firstVisit: (n: number) =>
      plural(
        n,
        'En pusselbit är redan upplåst – dags att börja pussla!',
        `${n} pusselbitar är redan upplåsta – dags att börja pussla!`,
      ),
    newSinceLastVisit: (n: number) =>
      plural(
        n,
        'En ny pusselbit har låsts upp sedan ditt senaste besök!',
        `${n} nya pusselbitar har låsts upp sedan ditt senaste besök!`,
      ),
    saving: 'Sparar …',
    saveRetrying: 'Kunde inte spara – försöker igen …',
    placedCount: (placed: number, total: number) => `${placed} av ${total} bitar på plats`,
    complete: 'Pusslet är komplett! Tack alla för alla miljöuppdrag.',
    allPlacedSoFar:
      'Alla upplåsta bitar ligger på plats. Fler bitar kommer när vi klarar fler uppdrag!',
  },

  missions: {
    heading: 'Alla luckor',
    lead: 'Öppna luckorna och bocka av uppdragen du har gjort – även från tidigare dagar.',
    locked: (date: string) => `Öppnas ${formatDate(date)}`,
    today: 'Idag',
    open: 'Öppna',
    done: 'Gjort',
    checkboxLabel: (day: number, title: string) => `Jag har gjort uppdrag ${day}: ${title}`,
    /** How many others have done this uppdrag; `completions` includes the user if they did it. */
    others: (completions: number, completedByMe: boolean) => {
      const others = completions - (completedByMe ? 1 : 0);
      if (completedByMe) {
        if (others <= 0) return 'Du är först med det här uppdraget!';
        return others === 1
          ? 'Du och en kollega har gjort uppdraget.'
          : `Du och ${others} kollegor har gjort uppdraget.`;
      }
      if (others <= 0) return 'Ingen har gjort uppdraget än – bli först!';
      return others === 1
        ? 'En kollega har gjort uppdraget.'
        : `${others} kollegor har gjort uppdraget.`;
    },
  },

  stats: {
    heading: 'Statistik',
    mine: 'Mina uppdrag',
    mineValue: (completed: number, possible: number) => `${completed} av ${possible} möjliga`,
    together: 'Skolkontoret tillsammans',
    togetherValue: (n: number) => `${n} uppdrag`,
    pieces: 'Pusselbitar',
    piecesValue: (unlocked: number, total: number) => `${unlocked} av ${total}`,
    participants: 'Deltagare',
  },

  celebrate: {
    pieceUnlocked: 'Ditt uppdrag låste upp en ny pusselbit!',
  },

  errors: {
    MISSION_LOCKED: 'Den luckan är inte öppen än.',
    CAMPAIGN_CLOSED: 'Kalendern är stängd för avbockningar.',
    UNAUTHENTICATED: 'Du har blivit utloggad. Ladda om sidan och logga in igen.',
    NETWORK: 'Ingen kontakt med servern. Kontrollera uppkopplingen och försök igen.',
    generic: 'Något gick fel. Försök igen.',
  },

  privacy: {
    heading: 'Om dina uppgifter',
    paragraphs: [
      'Vi sparar ditt namn, vilka luckor du har öppnat, vilka uppdrag du har bockat av och var du har lagt dina pusselbitar – inget annat.',
      'Ingen annan kan se dina uppgifter. Andra ser bara summan för hela Skolkontoret.',
      'Uppgifterna raderas efter kampanjen, senast 31 januari 2027.',
    ],
    footer: 'Miljöjulkalendern · Skolkontoret, Barn- och skolförvaltningen, Lunds kommun',
  },
};

export type ErrorKey = keyof typeof sv.errors;

export function errorMessage(code: string): string {
  return code in sv.errors ? sv.errors[code as ErrorKey] : sv.errors.generic;
}

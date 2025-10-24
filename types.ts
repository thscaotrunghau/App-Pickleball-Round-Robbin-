export interface Player {
  id: number;
  name: string;
}

export interface Match {
  id:string;
  team1: { player1: Player; player2: Player };
  team2: { player1: Player; player2: Player };
  score1: number | null;
  score2: number | null;
  completed: boolean;
}

export interface StandingsEntry {
  playerId: number;
  playerName:string;
  wins: number;
  losses: number;

  pointsFor: number;
  pointsAgainst: number;
  pointDifferential: number;
  matchesPlayed: number;
}

export interface Tournament {
    id: string;
    name: string;
    createdAt: string;
    players: Player[];
    matches: Match[];
    location?: string;
    time?: string;
}
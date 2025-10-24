import React, { useState, useMemo, useCallback, useEffect } from 'react';
import type { Player, Match, StandingsEntry, Tournament } from './types';
import { TrophyIcon, TrashIcon, UsersIcon, ListIcon, PickleballIcon, GuideIcon, ChartBarIcon, CalendarIcon, LocationMarkerIcon, ShareIcon, ClipboardCopyIcon, CheckIcon, PrinterIcon } from './components/icons';
import pako from 'pako';


type View = 'tournamentList' |'setup' | 'tournament';
type Tab = 'schedule' | 'standings' | 'progress' | 'guide';

// Helper functions for data compression and encoding
function uint8ArrayToBase64Url(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64UrlToUint8Array(base64: string): Uint8Array {
    let base64Standard = base64.replace(/-/g, '+').replace(/_/g, '/');
    while (base64Standard.length % 4) {
        base64Standard += '=';
    }
    const binary_string = window.atob(base64Standard);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes;
}

const calculateStandings = (tournament: Tournament | null): StandingsEntry[] => {
    if (!tournament) return [];
    const { players, matches } = tournament;
    
    const stats: { [key: number]: StandingsEntry } = players.reduce((acc, player) => {
        acc[player.id] = {
            playerId: player.id,
            playerName: player.name,
            wins: 0,
            losses: 0,
            pointsFor: 0,
            pointsAgainst: 0,
            pointDifferential: 0,
            matchesPlayed: 0
        };
        return acc;
    }, {} as { [key: number]: StandingsEntry });

    matches.filter(m => m.completed).forEach(match => {
        const { team1, team2, score1, score2 } = match;
        const s1 = score1 ?? 0;
        const s2 = score2 ?? 0;

        const t1p1Stats = stats[team1.player1.id];
        const t1p2Stats = stats[team1.player2.id];
        const t2p1Stats = stats[team2.player1.id];
        const t2p2Stats = stats[team2.player2.id];

        const allPlayerStats = [t1p1Stats, t1p2Stats, t2p1Stats, t2p2Stats];
        allPlayerStats.forEach(s => {
            if(s) s.matchesPlayed += 1;
        });

        if (t1p1Stats && t1p2Stats) {
            t1p1Stats.pointsFor += s1; t1p1Stats.pointsAgainst += s2;
            t1p2Stats.pointsFor += s1; t1p2Stats.pointsAgainst += s2;
        }
        if (t2p1Stats && t2p2Stats) {
            t2p1Stats.pointsFor += s2; t2p1Stats.pointsAgainst += s1;
            t2p2Stats.pointsFor += s2; t2p2Stats.pointsAgainst += s1;
        }

        if (s1 > s2) {
            if (t1p1Stats) t1p1Stats.wins += 1;
            if (t1p2Stats) t1p2Stats.wins += 1;
            if (t2p1Stats) t2p1Stats.losses += 1;
            if (t2p2Stats) t2p2Stats.losses += 1;
        } else if (s2 > s1) {
            if (t2p1Stats) t2p1Stats.wins += 1;
            if (t2p2Stats) t2p2Stats.wins += 1;
            if (t1p1Stats) t1p1Stats.losses += 1;
            if (t1p2Stats) t1p2Stats.losses += 1;
        }
    });
    
    return Object.values(stats)
        .map(s => ({ ...s, pointDifferential: s.pointsFor - s.pointsAgainst }))
        .sort((a, b) => {
            if (b.wins !== a.wins) return b.wins - a.wins;
            if (b.pointDifferential !== a.pointDifferential) return b.pointDifferential - a.pointDifferential;
            if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
            return a.losses - b.losses;
        });
};


const Header = () => (
  <header className="mb-8 text-center print:hidden">
    <div className="flex justify-center items-center gap-4 mb-2">
      <PickleballIcon />
      <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight">Pickleball Robin</h1>
    </div>
    <p className="text-lg text-gray-400">Quản lý Giải đấu Đôi Round Robin</p>
  </header>
);

const MatchItem: React.FC<{
    match: Match;
    onUpdateScore: (matchId: string, score1: number, score2: number) => void;
    onDeleteMatch: (matchId: string) => void;
    isReadOnly?: boolean;
}> = ({ match, onUpdateScore, onDeleteMatch, isReadOnly = false }) => {
    const [score1, setScore1] = useState(match.score1?.toString() || '');
    const [score2, setScore2] = useState(match.score2?.toString() || '');
    const [isEditing, setIsEditing] = useState(!match.completed);

    const handleSave = () => {
        const s1 = parseInt(score1, 10);
        const s2 = parseInt(score2, 10);
        if (!isNaN(s1) && !isNaN(s2)) {
            onUpdateScore(match.id, s1, s2);
            setIsEditing(false);
        }
    };
    
    const isTeam1Winner = match.completed && (match.score1 ?? 0) > (match.score2 ?? 0);
    const isTeam2Winner = match.completed && (match.score2 ?? 0) > (match.score1 ?? 0);

    const TeamDisplay: React.FC<{ team: { player1: Player; player2: Player }, isWinner: boolean }> = ({ team, isWinner }) => (
        <div className={`flex flex-col text-center sm:text-left ${isWinner ? 'text-green-400' : 'text-white'}`}>
            <span>{team.player1.name}</span>
            <span className="text-gray-500 text-sm mx-1">&</span>
            <span>{team.player2.name}</span>
        </div>
    );

    return (
        <div className="bg-gray-800 p-4 rounded-lg shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4 transition-all duration-300">
            <div className="flex-1 flex items-center justify-center sm:justify-start gap-2 font-semibold text-base sm:text-lg">
                <TeamDisplay team={match.team1} isWinner={isTeam1Winner} />
                <span className="text-gray-500 mx-2">vs</span>
                <TeamDisplay team={match.team2} isWinner={isTeam2Winner} />
            </div>
            <div className="flex items-center gap-2">
                <input
                    type="number"
                    value={score1}
                    onChange={(e) => setScore1(e.target.value)}
                    disabled={!isEditing || isReadOnly}
                    className="w-16 text-center bg-gray-700 text-white rounded-md p-2 border border-gray-600 focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:opacity-50"
                    placeholder="Đ1"
                />
                <span className="text-gray-400">-</span>
                <input
                    type="number"
                    value={score2}
                    onChange={(e) => setScore2(e.target.value)}
                    disabled={!isEditing || isReadOnly}
                    className="w-16 text-center bg-gray-700 text-white rounded-md p-2 border border-gray-600 focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:opacity-50"
                    placeholder="Đ2"
                />
            </div>
            {!isReadOnly && (
                <div className="w-full sm:w-auto flex items-center gap-2">
                    {isEditing ? (
                        <button onClick={handleSave} className="flex-grow w-full sm:w-auto bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors duration-200 font-semibold">
                            Lưu
                        </button>
                    ) : (
                        <button onClick={() => setIsEditing(true)} className="flex-grow w-full sm:w-auto bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors duration-200 font-semibold">
                            Sửa
                        </button>
                    )}
                    <button 
                        onClick={() => onDeleteMatch(match.id)} 
                        className="p-2.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors duration-200"
                        aria-label="Xóa trận đấu"
                    >
                        <TrashIcon />
                    </button>
                </div>
            )}
        </div>
    );
};

const StandingsTable: React.FC<{standings: StandingsEntry[], isPrintView?: boolean}> = ({ standings, isPrintView = false }) => {
    if (standings.length === 0) {
        return <p className="text-gray-400 text-center">Chưa có trận đấu nào hoàn thành.</p>;
    }
    const headers = [
        { key: 'Rank', label: 'Hạng', title: 'Thứ hạng' },
        { key: 'Player', label: 'VĐV', title: 'Vận động viên' },
        { key: 'W', label: 'T', title: 'Thắng' },
        { key: 'L', label: 'B', title: 'Bại' },
        { key: 'PF', label: 'Đ+', title: 'Điểm thắng' },
        { key: 'PA', label: 'Đ-', title: 'Điểm bại' },
        { key: 'PD', label: 'HS', title: 'Hiệu số' },
    ];
    
    if(isPrintView) {
      return (
        <div className="overflow-x-auto text-black">
            <table className="min-w-full border-collapse border border-gray-400">
                <thead>
                    <tr>
                        {headers.map(header => (
                            <th key={header.key} className="text-left font-bold p-2 border border-gray-400 bg-gray-200">{header.label}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {standings.map((entry, index) => (
                        <tr key={entry.playerId} className="even:bg-gray-100">
                            <td className="p-2 border border-gray-400 font-semibold">{index + 1}</td>
                            <td className="p-2 border border-gray-400 font-medium">{entry.playerName}</td>
                            <td className="p-2 border border-gray-400">{entry.wins}</td>
                            <td className="p-2 border border-gray-400">{entry.losses}</td>
                            <td className="p-2 border border-gray-400">{entry.pointsFor}</td>
                            <td className="p-2 border border-gray-400">{entry.pointsAgainst}</td>
                            <td className={`p-2 border border-gray-400 font-semibold`}>
                                {entry.pointDifferential > 0 ? `+${entry.pointDifferential}`: entry.pointDifferential}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
      );
    }
    
    return (
        <div className="overflow-x-auto">
            <table className="min-w-full bg-gray-800 rounded-lg shadow-lg">
                <thead className="bg-gray-700">
                    <tr>
                        {headers.map(header => (
                            <th key={header.key} title={header.title} className="text-left text-sm font-semibold text-gray-300 p-3 uppercase tracking-wider cursor-help">{header.label}</th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                    {standings.map((entry, index) => (
                        <tr key={entry.playerId} className="hover:bg-gray-700/50 transition-colors duration-200">
                            <td className="p-3 font-semibold text-white">
                                {index === 0 ? <TrophyIcon /> : index + 1}
                            </td>
                            <td className="p-3 font-medium text-green-400">{entry.playerName}</td>
                            <td className="p-3 text-white">{entry.wins}</td>
                            <td className="p-3 text-white">{entry.losses}</td>
                            <td className="p-3 text-gray-300">{entry.pointsFor}</td>
                            <td className="p-3 text-gray-300">{entry.pointsAgainst}</td>
                            <td className={`p-3 font-semibold ${entry.pointDifferential > 0 ? 'text-green-500' : entry.pointDifferential < 0 ? 'text-red-500' : 'text-gray-300'}`}>
                                {entry.pointDifferential > 0 ? `+${entry.pointDifferential}`: entry.pointDifferential}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const GuideTab = () => (
    <div className="text-gray-300 space-y-6 leading-relaxed">
        <h3 className="text-2xl font-bold text-white border-b-2 border-green-400 pb-2">Hướng dẫn & Luật thi đấu</h3>
        
        <div className="space-y-4">
            <div>
                <h4 className="font-semibold text-lg text-green-400">1. Luật Round Robin Đôi</h4>
                <p>Trong thể thức này, mỗi vận động viên (VĐV) sẽ lần lượt bắt cặp với các VĐV khác để thi đấu. Mục tiêu là tạo ra sự đa dạng trong các cặp đấu và đảm bảo mọi người đều có cơ hội thi đấu cùng nhau và chống lại nhau.</p>
            </div>
            <div>
                <h4 className="font-semibold text-lg text-green-400">2. Tạo Lịch thi đấu</h4>
                <p>Ứng dụng sẽ tự động tạo ra tất cả các trận đấu có thể từ nhóm VĐV của bạn. Nguyên tắc hoạt động là tìm ra tất cả các nhóm 4 người chơi duy nhất và tạo một trận đấu cho mỗi nhóm.</p>
                <p className="mt-2 font-semibold text-gray-200">Ví dụ với 5 VĐV (A, B, C, D, E):</p>
                <ul className="list-disc list-inside pl-4 mt-1 space-y-1">
                    <li>Ứng dụng sẽ xác định có 5 nhóm 4 người khác nhau có thể được tạo ra từ 5 VĐV này. Mỗi nhóm sẽ thi đấu một trận.</li>
                    <li>Ví dụ, nhóm {`{A, B, C, D}`} sẽ tạo ra một trận đấu như (A & B) đấu với (C & D).</li>
                    <li>Tổng cộng, với 5 VĐV, sẽ có 5 trận đấu được tạo ra. Lịch thi đấu sau đó được xáo trộn ngẫu nhiên để đảm bảo tính công bằng.</li>
                </ul>
            </div>
            <div>
                <h4 className="font-semibold text-lg text-green-400">3. Cách tính điểm</h4>
                <p>Sau mỗi trận đấu, hãy nhập điểm số cho cả hai đội và nhấn "Lưu". Trận đấu sẽ được đánh dấu là đã hoàn thành và kết quả sẽ được cập nhật tự động vào bảng xếp hạng.</p>
            </div>
            <div>
                <h4 className="font-semibold text-lg text-green-400">4. Xếp hạng Cá nhân</h4>
                <p>Bảng xếp hạng được tính dựa trên thành tích cá nhân của mỗi VĐV. Các tiêu chí xếp hạng theo thứ tự ưu tiên như sau:</p>
                <ul className="list-disc list-inside pl-4 mt-2 space-y-1">
                    <li><span className="font-bold">Số trận thắng (T):</span> Nhiều hơn sẽ xếp trên.</li>
                    <li><span className="font-bold">Hiệu số điểm (HS):</span> (Tổng điểm thắng - Tổng điểm bại). Cao hơn sẽ xếp trên.</li>
                    <li><span className="font-bold">Tổng điểm thắng (Đ+):</span> Nhiều hơn sẽ xếp trên.</li>
                    <li><span className="font-bold">Số trận thua (B):</span> Ít hơn sẽ xếp trên.</li>
                </ul>
            </div>
        </div>
    </div>
);

const PlayerProgressTab: React.FC<{ players: Player[], matches: Match[], standings: StandingsEntry[] }> = ({ players, matches, standings }) => {
    const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(players.length > 0 ? players[0].id : null);

    const selectedPlayerStandings = useMemo(() => standings.find(s => s.playerId === selectedPlayerId), [standings, selectedPlayerId]);

    const playerMatches = useMemo(() => {
        if (!selectedPlayerId) return [];
        return matches
            .filter(m => m.completed && (m.team1.player1.id === selectedPlayerId || m.team1.player2.id === selectedPlayerId || m.team2.player1.id === selectedPlayerId || m.team2.player2.id === selectedPlayerId))
            .map(match => {
                const isTeam1 = match.team1.player1.id === selectedPlayerId || match.team1.player2.id === selectedPlayerId;
                const partner = isTeam1
                    ? (match.team1.player1.id === selectedPlayerId ? match.team1.player2 : match.team1.player1)
                    : (match.team2.player1.id === selectedPlayerId ? match.team2.player2 : match.team2.player1);
                const opponents = isTeam1 ? match.team2 : match.team1;
                const score = isTeam1 ? `${match.score1} - ${match.score2}` : `${match.score2} - ${match.score1}`;
                const isWinner = isTeam1 ? (match.score1 ?? 0) > (match.score2 ?? 0) : (match.score2 ?? 0) > (match.score1 ?? 0);
                return { id: match.id, partner, opponents, score, isWinner };
            });
    }, [matches, selectedPlayerId]);

    if (players.length === 0) {
        return <p className="text-gray-400 text-center">Không có vận động viên nào trong giải đấu.</p>;
    }

    return (
        <div className="space-y-6">
            <div>
                <label htmlFor="player-select" className="block text-sm font-medium text-gray-300 mb-2">Chọn Vận Động Viên:</label>
                <select
                    id="player-select"
                    value={selectedPlayerId ?? ''}
                    onChange={e => setSelectedPlayerId(Number(e.target.value))}
                    className="w-full bg-gray-700 text-white rounded-md p-3 border border-gray-600 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                >
                    {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
            </div>
            
            {selectedPlayerStandings && (
                <div className="bg-gray-900/50 p-4 rounded-lg">
                    <h3 className="text-xl font-bold text-green-400 mb-4">{selectedPlayerStandings.playerName}</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                        <div><p className="text-sm text-gray-400">Thắng</p><p className="text-2xl font-semibold">{selectedPlayerStandings.wins}</p></div>
                        <div><p className="text-sm text-gray-400">Bại</p><p className="text-2xl font-semibold">{selectedPlayerStandings.losses}</p></div>
                        <div><p className="text-sm text-gray-400">Hiệu số</p><p className="text-2xl font-semibold">{selectedPlayerStandings.pointDifferential > 0 ? '+' : ''}{selectedPlayerStandings.pointDifferential}</p></div>
                        <div><p className="text-sm text-gray-400">Tổng điểm</p><p className="text-2xl font-semibold">{selectedPlayerStandings.pointsFor}</p></div>
                    </div>
                </div>
            )}

            <div>
                <h4 className="text-lg font-semibold text-white mb-2">Lịch sử đấu</h4>
                <div className="space-y-3">
                    {playerMatches.length > 0 ? playerMatches.map(pm => (
                        <div key={pm.id} className={`p-3 rounded-md ${pm.isWinner ? 'bg-green-800/30' : 'bg-red-800/30'}`}>
                            <div className="flex justify-between items-center">
                                <div>
                                    <p className="font-semibold">Đồng đội: <span className="font-normal text-gray-300">{pm.partner.name}</span></p>
                                    <p className="text-sm">vs {pm.opponents.player1.name} & {pm.opponents.player2.name}</p>
                                </div>
                                <div className="text-right">
                                    <p className={`font-bold text-lg ${pm.isWinner ? 'text-green-400' : 'text-red-400'}`}>{pm.isWinner ? 'Thắng' : 'Bại'}</p>
                                    <p className="text-sm text-gray-400">{pm.score}</p>
                                </div>
                            </div>
                        </div>
                    )) : <p className="text-gray-400 text-center italic">Chưa có trận đấu nào hoàn thành.</p>}
                </div>
            </div>
        </div>
    );
};

const ShareModal: React.FC<{ isOpen: boolean; onClose: () => void; link: string; }> = ({ isOpen, onClose, link }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50" onClick={onClose}>
            <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
                <h3 className="text-2xl font-bold text-white mb-4">Chia sẻ Giải đấu</h3>
                <p className="text-gray-400 mb-4">Bất kỳ ai có liên kết này đều có thể xem tiến trình của giải đấu ở chế độ chỉ đọc.</p>
                <div className="flex gap-2">
                    <input type="text" readOnly value={link} className="w-full bg-gray-700 text-gray-300 rounded-md p-2 border border-gray-600"/>
                    <button
                        onClick={handleCopy}
                        className={`px-4 py-2 rounded-md font-semibold text-white transition-colors flex items-center gap-2 ${copied ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-700'}`}
                    >
                        {copied ? <CheckIcon/> : <ClipboardCopyIcon />}
                        {copied ? 'Đã chép' : 'Chép'}
                    </button>
                </div>
                <button onClick={onClose} className="w-full mt-6 bg-gray-600 text-white py-2 rounded-md hover:bg-gray-700 transition">
                    Đóng
                </button>
            </div>
        </div>
    );
}

const formatSafeDate = (dateString?: string, includeTime: boolean = false): string => {
    if (!dateString) {
        return '';
    }
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
        return '';
    }

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    if (includeTime) {
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${day}/${month}/${year} ${hours}:${minutes}`;
    }

    return `${day}/${month}/${year}`;
};

const PrintableView: React.FC<{ tournament: Tournament, standings: StandingsEntry[] }> = ({ tournament, standings }) => {
    const formattedTime = formatSafeDate(tournament.time, true);
    const completedMatches = tournament.matches.filter(m => m.completed);
    return (
        <div className="hidden print:block text-black p-4">
            <header className="text-center mb-6">
                <h1 className="text-3xl font-bold mb-2">{tournament.name}</h1>
                <div className="flex justify-center items-center gap-x-6 text-gray-700">
                    {tournament.location && (
                        <span>Địa điểm: {tournament.location}</span>
                    )}
                    {formattedTime && (
                        <span>Thời gian: {formattedTime}</span>
                    )}
                </div>
            </header>
            
            <section className="mb-6">
                <h2 className="text-2xl font-semibold mb-3 border-b-2 border-black pb-2">Kết quả Chung cuộc</h2>
                <StandingsTable standings={standings} isPrintView={true} />
            </section>

            <section>
                <h2 className="text-2xl font-semibold mb-3 border-b-2 border-black pb-2">Kết quả các Trận đấu</h2>
                <div className="space-y-2">
                    {completedMatches.length > 0 ? completedMatches.map(match => (
                        <div key={match.id} className="border border-gray-300 p-2 rounded-md">
                           <p>
                             <span className="font-semibold">{match.team1.player1.name} & {match.team1.player2.name}</span>
                             <span className="font-bold mx-2">{match.score1} - {match.score2}</span>
                             <span className="font-semibold">{match.team2.player1.name} & {match.team2.player2.name}</span>
                           </p>
                        </div>
                    )) : <p className="text-gray-600">Chưa có trận đấu nào hoàn thành.</p>}
                </div>
            </section>
            
            <footer className="mt-8 text-center text-sm text-gray-500">
                <p>Báo cáo được tạo bởi Pickleball Robin.</p>
            </footer>
        </div>
    );
};


export default function App() {
    const [tournaments, setTournaments] = useState<Tournament[]>([]);
    const [view, setView] = useState<View>('tournamentList');
    const [activeTab, setActiveTab] = useState<Tab>('schedule');
    const [activeTournamentId, setActiveTournamentId] = useState<string | null>(null);
    const [viewOnlyTournament, setViewOnlyTournament] = useState<Tournament | null>(null);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [shareableLink, setShareableLink] = useState('');


    // Setup state
    const [players, setPlayers] = useState<Player[]>([]);
    const [newPlayerName, setNewPlayerName] = useState('');
    const [tournamentName, setTournamentName] = useState('');
    const [tournamentLocation, setTournamentLocation] = useState('');
    const [tournamentTime, setTournamentTime] = useState('');

    useEffect(() => {
        const hash = window.location.hash;
        if (hash.startsWith('#/view/')) {
            try {
                const compressedData = hash.substring(7);
                const compressed = base64UrlToUint8Array(compressedData);
                const jsonString = pako.inflate(compressed, { to: 'string' });
                const data = JSON.parse(jsonString);

                // Reconstruct players array
                const players: Player[] = data.p.map((name: string, index: number) => ({
                    id: index, // Use index as a simple, unique ID
                    name: name,
                }));

                // Reconstruct matches array from compact data
                const matches: Match[] = data.m.map((matchData: (number | null)[]) => {
                    const [p1_idx, p2_idx, p3_idx, p4_idx, score1, score2] = matchData;
                    const p1 = players[p1_idx as number];
                    const p2 = players[p2_idx as number];
                    const p3 = players[p3_idx as number];
                    const p4 = players[p4_idx as number];
                    
                    return {
                        id: `${p1_idx}-${p2_idx}-${p3_idx}-${p4_idx}`,
                        team1: { player1: p1, player2: p2 },
                        team2: { player1: p3, player2: p4 },
                        score1: score1 as number | null,
                        score2: score2 as number | null,
                        completed: score1 !== null && score2 !== null,
                    };
                });
                
                const tournamentData: Tournament = {
                    id: `shared_${Date.now()}`,
                    name: data.n,
                    createdAt: data.c,
                    players: players,
                    matches: matches,
                    location: data.l,
                    time: data.t,
                };

                setViewOnlyTournament(tournamentData);
                setView('tournament');
            } catch (e) {
                console.error("Failed to parse shared tournament link", e);
                alert("Liên kết chia sẻ không hợp lệ hoặc đã lỗi thời.");
                window.location.hash = '';
            }
        } else {
            try {
                const savedTournaments = localStorage.getItem('pickleballTournaments');
                if (savedTournaments) {
                    setTournaments(JSON.parse(savedTournaments));
                }
            } catch (error) {
                console.error("Failed to load tournaments from localStorage", error);
            }
        }
    }, []);

    useEffect(() => {
        if (!viewOnlyTournament) { // Only save to localStorage if not in view-only mode
             try {
                localStorage.setItem('pickleballTournaments', JSON.stringify(tournaments));
            } catch (error) {
                console.error("Failed to save tournaments to localStorage", error);
            }
        }
    }, [tournaments, viewOnlyTournament]);

    const activeTournament = useMemo(() => {
        return tournaments.find(t => t.id === activeTournamentId) || null;
    }, [tournaments, activeTournamentId]);

    const handleAddPlayer = (e: React.FormEvent) => {
        e.preventDefault();
        if (newPlayerName.trim() && !players.some(p => p.name === newPlayerName.trim())) {
            setPlayers([...players, { id: Date.now(), name: newPlayerName.trim() }]);
            setNewPlayerName('');
        }
    };

    const handleRemovePlayer = (id: number) => {
        setPlayers(players.filter(p => p.id !== id));
    };

    const handleCreateTournament = useCallback(() => {
        if (players.length < 4) {
            alert("Giải đấu đôi yêu cầu ít nhất 4 vận động viên.");
            return;
        }
        if (!tournamentName.trim()){
            alert("Vui lòng nhập tên giải đấu.");
            return;
        }

        const matches: Match[] = [];
        for (let i = 0; i < players.length; i++) {
            for (let j = i + 1; j < players.length; j++) {
                for (let k = j + 1; k < players.length; k++) {
                    for (let l = k + 1; l < players.length; l++) {
                        const p1 = players[i];
                        const p2 = players[j];
                        const p3 = players[k];
                        const p4 = players[l];
                        
                        matches.push({
                            id: `${p1.id}-${p2.id}-${p3.id}-${p4.id}`,
                            team1: { player1: p1, player2: p2 },
                            team2: { player1: p3, player2: p4 },
                            score1: null,
                            score2: null,
                            completed: false,
                        });
                    }
                }
            }
        }
        
        for (let i = matches.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [matches[i], matches[j]] = [matches[j], matches[i]];
        }

        const newTournament: Tournament = {
            id: `tourn_${Date.now()}`,
            name: tournamentName.trim(),
            createdAt: new Date().toISOString(),
            players: players,
            matches: matches,
            location: tournamentLocation.trim(),
            time: tournamentTime,
        }

        setTournaments(prev => [...prev, newTournament]);
        setActiveTournamentId(newTournament.id);
        setView('tournament');
        setActiveTab('schedule');

    }, [players, tournamentName, tournamentLocation, tournamentTime]);
    
    const handleUpdateScore = useCallback((matchId: string, score1: number, score2: number) => {
        setTournaments(prev => prev.map(t => {
            if (t.id === activeTournamentId) {
                return {
                    ...t,
                    matches: t.matches.map(m => m.id === matchId ? { ...m, score1, score2, completed: true } : m)
                }
            }
            return t;
        }));
    }, [activeTournamentId]);

    const handleDeleteMatch = useCallback((matchId: string) => {
        if (window.confirm("Bạn có chắc chắn muốn xóa trận đấu này không?")) {
            setTournaments(prev => prev.map(t => {
                if (t.id === activeTournamentId) {
                    return { ...t, matches: t.matches.filter(m => m.id !== matchId) };
                }
                return t;
            }));
        }
    }, [activeTournamentId]);

    const handleBackToList = () => {
        setActiveTournamentId(null);
        setView('tournamentList');
    };

    const handleStartNewTournament = () => {
        setPlayers([]);
        setNewPlayerName('');
        setTournamentName('');
        setTournamentLocation('');
        setTournamentTime('');
        setView('setup');
    }

    const handleLoadTournament = (id: string) => {
        setActiveTournamentId(id);
        setView('tournament');
        setActiveTab('schedule');
    }

    const handleDeleteTournament = (id: string) => {
        if (window.confirm("Bạn có chắc chắn muốn xóa vĩnh viễn giải đấu này không?")) {
            setTournaments(prev => prev.filter(t => t.id !== id));
        }
    }
    
    const handleShare = useCallback((tournament: Tournament) => {
        try {
            // Create a map from player ID to its index for quick lookups
            const playerIdToIndexMap = new Map<number, number>();
            tournament.players.forEach((p, index) => {
                playerIdToIndexMap.set(p.id, index);
            });

            // Create a compact representation of matches using player indices
            const compactMatches = tournament.matches.map(match => [
                playerIdToIndexMap.get(match.team1.player1.id),
                playerIdToIndexMap.get(match.team1.player2.id),
                playerIdToIndexMap.get(match.team2.player1.id),
                playerIdToIndexMap.get(match.team2.player2.id),
                match.score1,
                match.score2,
            ]);

            // Create the compact, shareable data object with single-letter keys
            const shareableData = {
                v: 1, // version
                n: tournament.name,
                l: tournament.location || undefined,
                t: tournament.time || undefined,
                c: tournament.createdAt,
                p: tournament.players.map(p => p.name),
                m: compactMatches,
            };

            const jsonString = JSON.stringify(shareableData);
            const compressed = pako.deflate(jsonString, { level: 9 }); // Use max compression
            const base64 = uint8ArrayToBase64Url(compressed);
            const link = `${window.location.origin}${window.location.pathname}#/view/${base64}`;
            
            setShareableLink(link);
            setIsShareModalOpen(true);
        } catch (error) {
            console.error("Failed to create share link", error);
            alert("Không thể tạo liên kết chia sẻ.");
        }
    }, []);
    
    const handlePrint = () => {
        window.print();
    };

    const tournamentForDisplay = viewOnlyTournament || activeTournament;

    const standings = useMemo<StandingsEntry[]>(() => {
        return calculateStandings(tournamentForDisplay);
    }, [tournamentForDisplay]);
    
    const renderTournamentList = () => (
        <div className="bg-gray-800 p-8 rounded-xl shadow-2xl max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold text-white mb-6 text-center">Các giải đấu đã lưu</h2>
            <div className="space-y-4 mb-6">
                {tournaments.length > 0 ? (
                    [...tournaments].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()).map(t => {
                        const formattedCreatedAt = formatSafeDate(t.createdAt);
                        const formattedTime = formatSafeDate(t.time, true);
                        return (
                            <div key={t.id} className="bg-gray-700 p-4 rounded-md flex justify-between items-center">
                                <div>
                                    <p className="text-white font-semibold text-lg">{t.name}</p>
                                    {formattedCreatedAt && <p className="text-xs text-gray-400 mb-2">Tạo lúc: {formattedCreatedAt}</p>}
                                    {t.location && (
                                        <div className="flex items-center gap-2 text-sm text-gray-300">
                                            <LocationMarkerIcon /> <span>{t.location}</span>
                                        </div>
                                    )}
                                    {formattedTime && (
                                        <div className="flex items-center gap-2 text-sm text-gray-300 mt-1">
                                            <CalendarIcon /> <span>{formattedTime}</span>
                                        </div>
                                    )}
                                </div>
                                <div className="flex flex-col gap-2">
                                    <button onClick={() => handleLoadTournament(t.id)} className="bg-blue-600 text-white px-4 py-2 text-sm rounded-md hover:bg-blue-700 transition">Mở</button>
                                    <button onClick={() => handleDeleteTournament(t.id)} className="bg-red-600 text-white p-2 text-sm rounded-md hover:bg-red-700 transition" aria-label="Xóa giải đấu"><TrashIcon/></button>
                                </div>
                            </div>
                        )
                    })
                ) : (
                    <p className="text-gray-400 text-center italic">Chưa có giải đấu nào được lưu.</p>
                )}
            </div>
            <button onClick={handleStartNewTournament} className="w-full bg-green-600 text-white py-4 rounded-md text-lg font-bold hover:bg-green-700 transition">
                Tạo giải đấu mới
            </button>
        </div>
    );
    
    const renderSetup = () => (
        <div className="bg-gray-800 p-8 rounded-xl shadow-2xl max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold text-white mb-6 text-center">Thiết lập Giải đấu</h2>
            <div className="space-y-4 mb-6">
                 <input
                    type="text"
                    value={tournamentName}
                    onChange={(e) => setTournamentName(e.target.value)}
                    placeholder="Nhập tên giải đấu"
                    className="w-full bg-gray-700 text-white rounded-md p-3 border border-gray-600 focus:ring-2 focus:ring-green-500 focus:border-green-500 transition"
                />
                 <input
                    type="text"
                    value={tournamentLocation}
                    onChange={(e) => setTournamentLocation(e.target.value)}
                    placeholder="Địa điểm tổ chức"
                    className="w-full bg-gray-700 text-white rounded-md p-3 border border-gray-600 focus:ring-2 focus:ring-green-500 focus:border-green-500 transition"
                />
                 <input
                    type="datetime-local"
                    value={tournamentTime}
                    onChange={(e) => setTournamentTime(e.target.value)}
                    placeholder="Thời gian bắt đầu"
                    className="w-full bg-gray-700 text-white rounded-md p-3 border border-gray-600 focus:ring-2 focus:ring-green-500 focus:border-green-500 transition"
                />
            </div>
            <form onSubmit={handleAddPlayer} className="flex gap-4 mb-6">
                <input
                    type="text"
                    value={newPlayerName}
                    onChange={(e) => setNewPlayerName(e.target.value)}
                    placeholder="Nhập tên VĐV"
                    className="flex-grow bg-gray-700 text-white rounded-md p-3 border border-gray-600 focus:ring-2 focus:ring-green-500 focus:border-green-500 transition"
                />
                <button type="submit" className="bg-green-600 text-white px-6 py-3 rounded-md hover:bg-green-700 transition-colors duration-200 font-semibold">Thêm</button>
            </form>
            <div className="space-y-3 mb-6">
                {players.map(player => (
                    <div key={player.id} className="bg-gray-700 p-3 rounded-md flex justify-between items-center animate-fade-in">
                        <span className="text-white font-medium">{player.name}</span>
                        <button onClick={() => handleRemovePlayer(player.id)} className="text-red-400 hover:text-red-500">
                            <TrashIcon />
                        </button>
                    </div>
                ))}
            </div>
            {players.length > 0 && <p className="text-gray-400 text-center mb-6">Đã thêm {players.length} VĐV.</p>}
            <button
                onClick={handleCreateTournament}
                disabled={players.length < 4 || !tournamentName.trim()}
                className="w-full bg-blue-600 text-white py-4 rounded-md text-lg font-bold hover:bg-blue-700 transition-colors duration-200 disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
                Tạo Lịch thi đấu
            </button>
             {players.length < 4 && <p className="text-center text-sm text-gray-400 mt-3">Cần ít nhất 4 VĐV để thi đấu đôi.</p>}
             <button onClick={() => setView('tournamentList')} className="w-full mt-4 bg-gray-600 text-white py-2 rounded-md hover:bg-gray-700 transition">
                Hủy
            </button>
        </div>
    );
    
    const renderTournament = (tournament: Tournament, isReadOnly: boolean = false) => {
        const formattedTime = formatSafeDate(tournament.time, true);
        return (
            <>
                <div className="max-w-4xl mx-auto print:hidden">
                    <div className="flex justify-between items-start mb-6 flex-wrap gap-4">
                        <div>
                            <h2 className="text-3xl font-bold text-white truncate">{tournament.name}</h2>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-x-6 gap-y-1 text-gray-400 mt-2">
                                {tournament.location && (
                                    <div className="flex items-center gap-2">
                                        <LocationMarkerIcon />
                                        <span>{tournament.location}</span>
                                    </div>
                                )}
                                {formattedTime && (
                                    <div className="flex items-center gap-2">
                                        <CalendarIcon />
                                        <span>{formattedTime}</span>
                                    </div>
                                )}
                            </div>
                             {isReadOnly && <div className="mt-2 text-sm text-yellow-400 bg-yellow-900/50 px-3 py-1 rounded-full inline-block">Chế độ chỉ đọc</div>}
                        </div>
                        <div className="flex gap-2 self-center">
                            {!isReadOnly && (
                                <>
                                    <button onClick={() => handleShare(tournament)} className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors duration-200 font-semibold flex items-center gap-2">
                                        <ShareIcon/> Chia sẻ
                                    </button>
                                    <button onClick={handlePrint} className="bg-teal-600 text-white px-4 py-2 rounded-md hover:bg-teal-700 transition-colors duration-200 font-semibold flex items-center gap-2">
                                        <PrinterIcon/> In
                                    </button>
                                    <button onClick={handleBackToList} className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors duration-200 font-semibold">
                                        Quay lại
                                    </button>
                                </>
                            )}
                             {isReadOnly && (
                                 <button onClick={() => window.location.hash = ''} className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors duration-200 font-semibold">
                                    Thoát chế độ xem
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="bg-gray-800 p-2 sm:p-6 rounded-xl shadow-2xl">
                        <div className="flex border-b border-gray-700 mb-6 overflow-x-auto">
                            <button
                                onClick={() => setActiveTab('schedule')}
                                className={`flex items-center gap-2 px-3 py-3 font-semibold transition-colors duration-200 whitespace-nowrap ${activeTab === 'schedule' ? 'text-green-400 border-b-2 border-green-400' : 'text-gray-400 hover:text-white'}`}
                            >
                                <ListIcon /> Lịch thi đấu
                            </button>
                            <button
                                onClick={() => setActiveTab('standings')}
                                className={`flex items-center gap-2 px-3 py-3 font-semibold transition-colors duration-200 whitespace-nowrap ${activeTab === 'standings' ? 'text-green-400 border-b-2 border-green-400' : 'text-gray-400 hover:text-white'}`}
                            >
                                <UsersIcon /> Bảng xếp hạng
                            </button>
                            <button
                                onClick={() => setActiveTab('progress')}
                                className={`flex items-center gap-2 px-3 py-3 font-semibold transition-colors duration-200 whitespace-nowrap ${activeTab === 'progress' ? 'text-green-400 border-b-2 border-green-400' : 'text-gray-400 hover:text-white'}`}
                            >
                                <ChartBarIcon /> Vận động viên
                            </button>
                            <button
                                onClick={() => setActiveTab('guide')}
                                className={`flex items-center gap-2 px-3 py-3 font-semibold transition-colors duration-200 whitespace-nowrap ${activeTab === 'guide' ? 'text-green-400 border-b-2 border-green-400' : 'text-gray-400 hover:text-white'}`}
                            >
                                <GuideIcon /> Hướng dẫn
                            </button>
                        </div>
                        {activeTab === 'schedule' && (
                            <div className="space-y-4">
                                {tournament.matches.length > 0 ? tournament.matches.map(match => (
                                    <MatchItem key={match.id} match={match} onUpdateScore={handleUpdateScore} onDeleteMatch={handleDeleteMatch} isReadOnly={isReadOnly} />
                                )) : <p className="text-gray-400 text-center">Chưa có trận đấu nào được tạo.</p>}
                            </div>
                        )}
                        {activeTab === 'standings' && <StandingsTable standings={standings} />}
                        {activeTab === 'progress' && <PlayerProgressTab players={tournament.players} matches={tournament.matches} standings={standings} />}
                        {activeTab === 'guide' && <GuideTab />}
                    </div>
                </div>
            </>
        )
    };
    
    const isReadOnly = !!viewOnlyTournament;

    return (
        <div className="min-h-screen text-white p-4 sm:p-8">
            <div className="container mx-auto">
                <Header />
                {view === 'tournamentList' && renderTournamentList()}
                {view === 'setup' && renderSetup()}
                {view === 'tournament' && tournamentForDisplay && renderTournament(tournamentForDisplay, isReadOnly)}
                 <ShareModal isOpen={isShareModalOpen} onClose={() => setIsShareModalOpen(false)} link={shareableLink} />
                 {tournamentForDisplay && <PrintableView tournament={tournamentForDisplay} standings={standings} />}
            </div>
        </div>
    );
}
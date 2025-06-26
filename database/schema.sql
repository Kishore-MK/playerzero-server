-- Create games table for storing game information
CREATE TABLE IF NOT EXISTS games (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    game_name VARCHAR(255) NOT NULL,
    game_id VARCHAR(50) UNIQUE NOT NULL, -- The short game ID like "ABC123DEF"
    status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished')),
    visibility VARCHAR(20) DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
    players JSONB DEFAULT '[]'::jsonb,
    game_state JSONB DEFAULT '{}'::jsonb,
    host_player_id VARCHAR(255),
    current_players INTEGER DEFAULT 0,
    max_players INTEGER DEFAULT 4,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_games_visibility ON games(visibility);
CREATE INDEX IF NOT EXISTS idx_games_game_id ON games(game_id);
CREATE INDEX IF NOT EXISTS idx_games_created_at ON games(created_at);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_games_updated_at
    BEFORE UPDATE ON games
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create view for public games list
CREATE OR REPLACE VIEW public_games AS
SELECT 
    id,
    game_name,
    game_id,
    status,
    current_players,
    max_players,
    (players->0->>'name')::text AS host_name,
    created_at
FROM games 
WHERE visibility = 'public' 
    AND status = 'waiting'
    AND current_players < max_players
ORDER BY created_at DESC;

-- Enable Row Level Security (RLS)
ALTER TABLE games ENABLE ROW LEVEL SECURITY;

-- Create policies for public access
CREATE POLICY "Anyone can view public games" ON games
    FOR SELECT USING (visibility = 'public');

CREATE POLICY "Anyone can create games" ON games
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update games" ON games
    FOR UPDATE USING (true);

-- Grant access to authenticated and anonymous users
GRANT ALL ON games TO authenticated;
GRANT ALL ON games TO anon;
GRANT SELECT ON public_games TO authenticated;
GRANT SELECT ON public_games TO anon;


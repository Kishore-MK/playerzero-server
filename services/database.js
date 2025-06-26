import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Create a single Supabase client for interacting with your database
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Use service role for server operations

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase configuration. Please check your environment variables.');
  console.log('SUPABASE_URL:', supabaseUrl ? 'Set' : 'Not set');
  console.log('SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? 'Set' : 'Not set');
  throw new Error('Supabase configuration required');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// Database operations for games
export class GameDatabase {
  
// Create a new game in the database
  static async createGame(gameData) {
    try {
      console.log('Attempting to create game with data:', {
        gameName: gameData.gameName,
        gameId: gameData.gameId,
        isPrivate: gameData.isPrivate,
        playersCount: gameData.players ? gameData.players.length : 0
      });
      
      const { data, error } = await supabase
        .from('games')
        .insert([
          {
            game_name: gameData.gameName,
            game_id: gameData.gameId,
            status: 'waiting',
            visibility: gameData.isPrivate ? 'private' : 'public',
            players: gameData.players || [],
            game_state: gameData.gameState || {},
            host_player_id: gameData.hostPlayerId,
            current_players: gameData.players ? gameData.players.length : 0,
            max_players: 4
          }
        ])
        .select()
        .single();

      if (error) {
        console.error('Supabase error creating game:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        return null;
      }

      console.log('Game created successfully:', data);
      return data;
    } catch (err) {
      console.error('Database error creating game:', {
        message: err.message,
        stack: err.stack,
        name: err.name,
        cause: err.cause
      });
      return null;
    }
  }

  // Get a game by game_id
  static async getGame(gameId) {
    try {
      const { data, error } = await supabase
        .from('games')
        .select('*')
        .eq('game_id', gameId)
        .single();

      if (error) {
        console.error('Error fetching game:', error);
        return null;
      }

      return data;
    } catch (err) {
      console.error('Database error fetching game:', err);
      return null;
    }
  }

  // Update game state
  static async updateGame(gameId, updateData) {
    try {
      const { data, error } = await supabase
        .from('games')
        .update(updateData)
        .eq('game_id', gameId)
        .select()
        .single();

      if (error) {
        console.error('Error updating game:', error);
        return null;
      }

      return data;
    } catch (err) {
      console.error('Database error updating game:', err);
      return null;
    }
  }

  // Get all public games that are waiting for players
  static async getPublicGames() {
    try {
      const { data, error } = await supabase
        .from('public_games')
        .select('*');

      if (error) {
        console.error('Error fetching public games:', error);
        return [];
      }

      return data || [];
    } catch (err) {
      console.error('Database error fetching public games:', err);
      return [];
    }
  }

  // Add a player to a game
  static async addPlayerToGame(gameId, playerData) {
    try {
      // First get the current game
      const game = await this.getGame(gameId);
      if (!game) return null;

      // Add player to the players array
      const updatedPlayers = [...game.players, playerData];
      const currentPlayerCount = updatedPlayers.length;

      const { data, error } = await supabase
        .from('games')
        .update({
          players: updatedPlayers,
          current_players: currentPlayerCount
        })
        .eq('game_id', gameId)
        .select()
        .single();

      if (error) {
        console.error('Error adding player to game:', error);
        return null;
      }

      return data;
    } catch (err) {
      console.error('Database error adding player:', err);
      return null;
    }
  }

  // Update game status (waiting, playing, finished)
  static async updateGameStatus(gameId, status) {
    try {
      const { data, error } = await supabase
        .from('games')
        .update({ status })
        .eq('game_id', gameId)
        .select()
        .single();

      if (error) {
        console.error('Error updating game status:', error);
        return null;
      }

      return data;
    } catch (err) {
      console.error('Database error updating status:', err);
      return null;
    }
  }

  // Delete a game (cleanup)
  static async deleteGame(gameId) {
    try {
      const { error } = await supabase
        .from('games')
        .delete()
        .eq('game_id', gameId);

      if (error) {
        console.error('Error deleting game:', error);
        return false;
      }

      return true;
    } catch (err) {
      console.error('Database error deleting game:', err);
      return false;
    }
  }

  // Clean up old finished games (run periodically)
  static async cleanupOldGames(hoursOld = 24) {
    try {
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - hoursOld);

      const { error } = await supabase
        .from('games')
        .delete()
        .eq('status', 'finished')
        .lt('updated_at', cutoffTime.toISOString());

      if (error) {
        console.error('Error cleaning up old games:', error);
        return false;
      }

      console.log(`Cleaned up finished games older than ${hoursOld} hours`);
      return true;
    } catch (err) {
      console.error('Database error cleaning up games:', err);
      return false;
    }
  }

  // Clean up stale open/waiting games (games that have been waiting too long)
  static async cleanupStaleOpenGames(minutesOld = 30) {
    try {
      const cutoffTime = new Date();
      cutoffTime.setMinutes(cutoffTime.getMinutes() - minutesOld);

      // Delete games that are still 'waiting' (Open status) but haven't been updated recently
      const { data: stalGames, error: selectError } = await supabase
        .from('games')
        .select('game_id, game_name, created_at, updated_at')
        .eq('status', 'waiting')
        .eq('visibility', 'public')
        .lt('updated_at', cutoffTime.toISOString());

      if (selectError) {
        console.error('Error finding stale open games:', selectError);
        return false;
      }

      if (stalGames && stalGames.length > 0) {
        console.log(`Found ${stalGames.length} stale open games to cleanup:`, 
          stalGames.map(g => ({ id: g.game_id, name: g.game_name, age: Math.round((Date.now() - new Date(g.updated_at)) / 60000) + ' mins' })));

        const { error: deleteError } = await supabase
          .from('games')
          .delete()
          .eq('status', 'waiting')
          .eq('visibility', 'public')
          .lt('updated_at', cutoffTime.toISOString());

        if (deleteError) {
          console.error('Error deleting stale open games:', deleteError);
          return false;
        }

        console.log(`✅ Cleaned up ${stalGames.length} stale open games older than ${minutesOld} minutes`);
        return stalGames.length;
      } else {
        console.log(`No stale open games found (older than ${minutesOld} minutes)`);
        return 0;
      }
    } catch (err) {
      console.error('Database error cleaning up stale open games:', err);
      return false;
    }
  }

  // Clean up abandoned games (games with no recent activity)
  static async cleanupAbandonedGames(hoursOld = 2) {
    try {
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - hoursOld);

      // Delete games that are waiting but haven't had any player activity
      const { data: abandonedGames, error: selectError } = await supabase
        .from('games')
        .select('game_id, game_name, current_players, created_at')
        .eq('status', 'waiting')
        .eq('current_players', 1) // Only host, no other players joined
        .lt('created_at', cutoffTime.toISOString());

      if (selectError) {
        console.error('Error finding abandoned games:', selectError);
        return false;
      }

      if (abandonedGames && abandonedGames.length > 0) {
        console.log(`Found ${abandonedGames.length} abandoned games to cleanup:`, 
          abandonedGames.map(g => ({ id: g.game_id, name: g.game_name, players: g.current_players })));

        const { error: deleteError } = await supabase
          .from('games')
          .delete()
          .eq('status', 'waiting')
          .eq('current_players', 1)
          .lt('created_at', cutoffTime.toISOString());

        if (deleteError) {
          console.error('Error deleting abandoned games:', deleteError);
          return false;
        }

        console.log(`✅ Cleaned up ${abandonedGames.length} abandoned games older than ${hoursOld} hours`);
        return abandonedGames.length;
      } else {
        console.log(`No abandoned games found (older than ${hoursOld} hours)`);
        return 0;
      }
    } catch (err) {
      console.error('Database error cleaning up abandoned games:', err);
      return false;
    }
  }

  // Comprehensive cleanup method that runs all cleanup operations
  static async performFullCleanup() {
    console.log('🧹 Starting full database cleanup...');
    
    try {
      // Clean up stale open games (30 minutes old)
      const staleCount = await this.cleanupStaleOpenGames(30);
      
      // Clean up abandoned games (2 hours old, only host)
      const abandonedCount = await this.cleanupAbandonedGames(2);
      
      // Clean up old finished games (24 hours old)
      const finishedCleanup = await this.cleanupOldGames(24);
      
      console.log('🧹 Database cleanup completed:', {
        staleGamesRemoved: staleCount,
        abandonedGamesRemoved: abandonedCount,
        finishedGamesCleanup: finishedCleanup
      });
      
      return {
        success: true,
        staleGamesRemoved: staleCount,
        abandonedGamesRemoved: abandonedCount,
        finishedGamesCleanup: finishedCleanup
      };
    } catch (err) {
      console.error('Error in full cleanup:', err);
      return { success: false, error: err.message };
    }
  }
}


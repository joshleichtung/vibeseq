require 'sinatra'
require 'sinatra-websocket'
require 'json'

set :server, 'thin'
set :sockets, []

# Enable CORS for frontend
configure do
  enable :cross_origin
end

before do
  response.headers['Access-Control-Allow-Origin'] = '*'
  response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
  response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
end

options '*' do
  response.headers['Access-Control-Allow-Origin'] = '*'
  response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
  response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
  200
end

# Serve static files from public directory
set :public_folder, File.dirname(__FILE__) + '/public'

# Drum pattern state - shared across all users
@@drum_pattern = {
  bpm: 120,
  playing: false,
  current_step: 0,
  tracks: {
    kick: { 
      pattern: Array.new(16, false),
      params: { pitch: 60, decay: 0.3, volume: 0.8 }
    },
    snare: { 
      pattern: Array.new(16, false),
      params: { pitch: 200, decay: 0.2, volume: 0.7 }
    },
    hihat: { 
      pattern: Array.new(16, false),
      params: { pitch: 800, decay: 0.1, volume: 0.6 }
    },
    openhat: { 
      pattern: Array.new(16, false),
      params: { pitch: 1000, decay: 0.4, volume: 0.5 }
    }
  }
}

get '/' do
  if !request.websocket?
    # Serve the main page (will be created later)
    erb :index
  else
    request.websocket do |ws|
      ws.onopen do
        settings.sockets << ws
        # Send current state to new client
        ws.send(JSON.generate({
          type: 'state_update',
          data: @@drum_pattern
        }))
        puts "Client connected. Total clients: #{settings.sockets.length}"
      end

      ws.onmessage do |msg|
        begin
          data = JSON.parse(msg)
          
          case data['type']
          when 'toggle_step'
            track = data['track']
            step = data['step']
            if @@drum_pattern[:tracks][track.to_sym]
              @@drum_pattern[:tracks][track.to_sym][:pattern][step] = 
                !@@drum_pattern[:tracks][track.to_sym][:pattern][step]
              
              # Broadcast to all clients
              broadcast_message = JSON.generate({
                type: 'pattern_update',
                data: {
                  track: track,
                  step: step,
                  active: @@drum_pattern[:tracks][track.to_sym][:pattern][step]
                }
              })
              settings.sockets.each { |s| s.send(broadcast_message) }
            end
            
          when 'update_params'
            track = data['track']
            params = data['params']
            if @@drum_pattern[:tracks][track.to_sym]
              @@drum_pattern[:tracks][track.to_sym][:params].merge!(params)
              
              # Broadcast to all clients
              broadcast_message = JSON.generate({
                type: 'params_update',
                data: {
                  track: track,
                  params: @@drum_pattern[:tracks][track.to_sym][:params]
                }
              })
              settings.sockets.each { |s| s.send(broadcast_message) }
            end
            
          when 'transport_control'
            action = data['action']
            case action
            when 'play'
              @@drum_pattern[:playing] = true
            when 'stop'
              @@drum_pattern[:playing] = false
              @@drum_pattern[:current_step] = 0
            when 'set_bpm'
              @@drum_pattern[:bpm] = data['bpm']
            end
            
            # Broadcast to all clients
            broadcast_message = JSON.generate({
              type: 'transport_update',
              data: {
                playing: @@drum_pattern[:playing],
                current_step: @@drum_pattern[:current_step],
                bpm: @@drum_pattern[:bpm]
              }
            })
            settings.sockets.each { |s| s.send(broadcast_message) }
            
          when 'step_update'
            @@drum_pattern[:current_step] = data['step']
            
            # Broadcast to all clients
            broadcast_message = JSON.generate({
              type: 'step_position',
              data: { current_step: data['step'] }
            })
            settings.sockets.each { |s| s.send(broadcast_message) }
          end
          
        rescue JSON::ParserError => e
          puts "Invalid JSON received: #{e}"
        end
      end

      ws.onclose do
        settings.sockets.delete(ws)
        puts "Client disconnected. Total clients: #{settings.sockets.length}"
      end
    end
  end
end

# API endpoint to get current state
get '/api/state' do
  content_type :json
  JSON.generate(@@drum_pattern)
end
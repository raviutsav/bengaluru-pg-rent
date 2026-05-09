import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // ---------------------------------------------------------
  // 1. Manual Auth Check (Shared Secret)
  // ---------------------------------------------------------
  const authHeader = req.headers.get('Authorization')
  const supabaseKey = Deno.env.get('APP_ANON_KEY')

  // We check if the auth header matches the project's anon key
  // This ensures only your application (which has this key) can call it
  if (!authHeader || (supabaseKey && !authHeader.includes(supabaseKey))) {
    console.warn("[Auth] Unauthorized request attempt")
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 401,
    })
  }

  try {
    const { url } = await req.json()

    if (!url) {
      return new Response(JSON.stringify({ error: 'URL is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    console.log(`[Resolve] Incoming URL: ${url}`)

    let currentUrl = url
    let hopCount = 0
    const maxHops = 10
    let finalHtml = ''

    // Follow redirects manually
    while (hopCount < maxHops) {
      try {
        const response = await fetch(currentUrl, {
          redirect: 'manual',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cookie': 'CONSENT=YES+cb.20210328-17-p0.en+FX+417', // Attempt to bypass consent page
          }
        })

        const location = response.headers.get('location')
        console.log(`[Hop ${hopCount}] Status: ${response.status}, Location: ${location}`)

        if (location) {
          const nextUrl = new URL(location, currentUrl).href
          currentUrl = nextUrl
          hopCount++
          
          // Precise coords check
          if (currentUrl.includes('!3d') && currentUrl.includes('!4d')) break
          if (currentUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)) break
        } else {
          if (response.status === 200) {
            finalHtml = await response.text()
            
            // Check for meta refresh
            const refreshMatch = finalHtml.match(/<meta[^>]*http-equiv=["']refresh["'][^>]*url=([^"'>]+)["']/i)
            if (refreshMatch && refreshMatch[1]) {
              const nextUrl = new URL(refreshMatch[1].replace(/&amp;/g, '&'), currentUrl).href
              console.log(`[Meta Refresh] -> ${nextUrl}`)
              currentUrl = nextUrl
              hopCount++
              continue
            }
          }
          break
        }
      } catch (e) {
        console.error(`[Fetch Error] ${e.message}`)
        break
      }
    }

    const extractCoords = (text: string) => {
      // 1. URL patterns (!3d, @lat,lng, q=)
      const lat3d = text.match(/!3d(-?\d+\.\d+)/)
      const lng4d = text.match(/!4d(-?\d+\.\d+)/)
      if (lat3d && lng4d) return { lat: parseFloat(lat3d[1]), lng: parseFloat(lng4d[1]) }

      const atMatch = text.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
      if (atMatch) return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) }

      const qMatch = text.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/)
      if (qMatch) return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) }

      // 2. HTML patterns (APP_INITIALIZATION_STATE, state blobs)
      const stateMatch = text.match(/APP_INITIALIZATION_STATE=\[\[\[(-?\d+\.\d+),(-?\d+\.\d+)\]/)
      if (stateMatch) return { lat: parseFloat(stateMatch[2]), lng: parseFloat(stateMatch[1]) }

      // 3. Script blobs: [null,null,null,lat,lng]
      const scriptMatch = text.match(/\[null,null,null,(-?\d+\.\d+),(-?\d+\.\d+)\]/)
      if (scriptMatch) return { lat: parseFloat(scriptMatch[1]), lng: parseFloat(scriptMatch[2]) }

      // 4. Generic lat,lng in text
      const genericMatch = text.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/)
      if (genericMatch) {
        const lat = parseFloat(genericMatch[1])
        const lng = parseFloat(genericMatch[2])
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          // Additional check: coordinates in Google Maps often have many decimals
          if (genericMatch[1].includes('.') && genericMatch[2].includes('.')) {
            return { lat, lng }
          }
        }
      }

      return null
    }

    let coords = extractCoords(currentUrl)
    if (!coords && finalHtml) {
      coords = extractCoords(finalHtml)
    }

    if (coords) {
      console.log(`[Success] Resolved: ${coords.lat}, ${coords.lng}`)
      return new Response(JSON.stringify({ 
        lat: coords.lat, 
        lng: coords.lng,
        longUrl: currentUrl 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    console.warn(`[Fail] Final URL: ${currentUrl}`)
    return new Response(JSON.stringify({ 
      error: 'Resolution failed', 
      finalUrl: currentUrl 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 404,
    })

  } catch (error) {
    console.error(`[Fatal] ${error.message}`)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})

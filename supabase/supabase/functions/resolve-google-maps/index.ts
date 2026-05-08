import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { url } = await req.json()
    
    if (!url) {
      return new Response(JSON.stringify({ error: 'URL is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    console.log(`Resolving URL: ${url}`)

    // Follow redirects manually to capture the final URL containing coordinates
    let currentUrl = url
    let hopCount = 0
    const maxHops = 10
    let finalHtml = ''

    while (hopCount < maxHops) {
      const response = await fetch(currentUrl, { 
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      })
      
      const location = response.headers.get('location')
      
      if (location) {
        currentUrl = new URL(location, currentUrl).href
        hopCount++
        if (currentUrl.includes('@') || currentUrl.includes('!3d') || currentUrl.includes('q=')) break
      } else {
        // If no location header, check if it's a 200 page with a redirect/meta tag
        if (response.status === 200) {
          finalHtml = await response.text()
          // Look for canonical links or meta refresh
          const canonicalMatch = finalHtml.match(/<link rel="canonical" href="([^"]+)"/) || 
                               finalHtml.match(/<meta property="og:url" content="([^"]+)"/);
          if (canonicalMatch && canonicalMatch[1] !== currentUrl) {
            currentUrl = canonicalMatch[1]
            hopCount++
            continue
          }
        }
        break
      }
    }

    console.log(`Final URL after ${hopCount} hops: ${currentUrl}`)

    // Try to extract coordinates from the final URL or the HTML content
    const extractCoords = (text: string) => {
      // 1. Try independent !3d (lat) and !4d (lng) - most precise for pins
      const lat3d = text.match(/!3d(-?\d+\.\d+)/);
      const lng4d = text.match(/!4d(-?\d+\.\d+)/);
      if (lat3d && lng4d) {
        return [null, lat3d[1], lng4d[1]];
      }

      // 2. Try standard @lat,lng
      const atMatch = text.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (atMatch) return atMatch;

      // 3. Try q=lat,lng
      const qMatch = text.match(/q=(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (qMatch) return qMatch;

      // 4. Try path segment /lat,lng/
      const pathMatch = text.match(/\/(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (pathMatch) return pathMatch;

      // 5. Try ll=lat,lng
      const llMatch = text.match(/ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (llMatch) return llMatch;

      return null;
    }

    let coordsMatch = extractCoords(currentUrl);
    
    // If not found in URL, look in the HTML (sometimes in meta tags or script blocks)
    if (!coordsMatch && finalHtml) {
      coordsMatch = extractCoords(finalHtml);
    }

    if (coordsMatch) {
      const lat = parseFloat(coordsMatch[1])
      const lng = parseFloat(coordsMatch[2])
      
      return new Response(JSON.stringify({ 
        lat, 
        lng,
        longUrl: currentUrl 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    return new Response(JSON.stringify({ 
      error: 'Could not resolve coordinates from the provided link', 
      finalUrl: currentUrl 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 404,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})

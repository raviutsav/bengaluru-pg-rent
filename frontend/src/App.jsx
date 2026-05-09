import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { GoogleMap, useJsApiLoader, OverlayViewF, MarkerF, TransitLayer, MarkerClustererF } from '@react-google-maps/api';
// We are migrating away from use-places-autocomplete to use the new Google Maps Places API
import { Search, Filter, X, Plus, Home, MapPin, IndianRupee, Star, Train, Share2 } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import './index.css';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const MAP_LIBRARIES = ['places'];
const mapContainerStyle = { height: '100%', width: '100%' };

const defaultCenter = { lat: 12.9716, lng: 77.5946 }; // Bangalore

const getMarkerIcon = (pg) => {
  const backendRents = pg.pg_rent || [];
  const localRents = pg.rents || [];
  const activeRents = [...backendRents, ...localRents];
  
  let markerColor = '#64748b';
  let lines = [{ sharing: '-', price: 'NA' }];
  
  if (activeRents.length > 0) {
    // Calculate overall average rating
    const ratings = activeRents.map(r => r.rating).filter(r => r != null);
    let avgRating = 0;
    if (ratings.length > 0) {
      avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    }
    
    // Map rating to color (red to green spectrum)
    if (avgRating > 0) {
      // Map rating 1-5 to hue 0-120 (0 = Red, 120 = Green)
      const hue = Math.max(0, Math.min(120, (avgRating - 1) * 30));
      markerColor = `hsl(${hue}, 85%, 45%)`;
    }
    
    // Calculate average rent per room type
    const rentByRoom = {};
    activeRents.forEach(r => {
      if (!rentByRoom[r.room_type]) {
        rentByRoom[r.room_type] = { sum: 0, count: 0 };
      }
      rentByRoom[r.room_type].sum += r.monthly_rent;
      rentByRoom[r.room_type].count += 1;
    });
    
    const typeMapping = {
      'single': '1',
      'studio': '1',
      'double': '2',
      'triple': '3',
      'quadruple': '4'
    };
    
    lines = Object.entries(rentByRoom).map(([type, data]) => {
      const avgRent = data.sum / data.count;
      const label = typeMapping[type] || type.charAt(0).toUpperCase();
      return {
        sharing: label,
        price: `₹${(avgRent/1000).toFixed(1)}k`
      };
    });
  }

  const fontSizePrice = 13;
  const fontSizeSharing = 11;
  const rowHeight = 24;
  const paddingY = 6;
  const paddingX = 10;
  const circleRadius = 10;
  const gap = 8;
  
  const maxPriceChars = Math.max(...lines.map(l => l.price.length));
  const priceTextWidth = maxPriceChars * 8.5;
  const width = Math.max(90, paddingX + (circleRadius * 2) + gap + priceTextWidth + paddingX); 
  const rectHeight = lines.length * rowHeight + paddingY * 2;
  const height = rectHeight + 8; // pointer triangle height
  const centerX = width / 2;

  const rowElements = lines.map((line, index) => {
    const yCenter = paddingY + (index * rowHeight) + (rowHeight / 2);
    const circleX = paddingX + circleRadius;
    const textX = paddingX + (circleRadius * 2) + gap;
    
    return `<g>
      <circle cx="${circleX}" cy="${yCenter}" r="${circleRadius}" fill="rgba(255,255,255,0.25)"/>
      <text x="${circleX}" y="${yCenter + 1}" dominant-baseline="central" text-anchor="middle" fill="white" font-family="sans-serif" font-size="${fontSizeSharing}px" font-weight="bold">${line.sharing}</text>
      <text x="${textX}" y="${yCenter + 1}" dominant-baseline="central" fill="white" font-family="sans-serif" font-size="${fontSizePrice}px" font-weight="bold">${line.price}</text>
    </g>`;
  }).join('');

  const r = 8;
  const path = `M ${r} 1 
                L ${width - r} 1 
                A ${r} ${r} 0 0 1 ${width - 1} ${r + 1} 
                L ${width - 1} ${rectHeight - r - 1} 
                A ${r} ${r} 0 0 1 ${width - r - 1} ${rectHeight - 1} 
                L ${centerX + 8} ${rectHeight - 1} 
                L ${centerX} ${height - 1} 
                L ${centerX - 8} ${rectHeight - 1} 
                L ${r + 1} ${rectHeight - 1} 
                A ${r} ${r} 0 0 1 1 ${rectHeight - r - 1} 
                L 1 ${r + 1} 
                A ${r} ${r} 0 0 1 ${r + 1} 1 Z`.replace(/\n\s+/g, ' ');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width)}" height="${Math.round(height)}" viewBox="0 0 ${Math.round(width)} ${Math.round(height)}">
    <path d="${path}" fill="${markerColor}" stroke="white" stroke-width="2"/>
    ${rowElements}
  </svg>`;
  
  return {
    url: `data:image/svg+xml;base64,${btoa(svg)}`,
    width: Math.round(width),
    height: Math.round(height)
  };
};

// Mock Data for initial PGs
const mockPgs = [
  {
    id: 1,
    name: 'Sunrise Coliving',
    address: 'Indiranagar, Bangalore',
    latitude: 12.9784,
    longitude: 77.6408,
    pg_type: 'coliving',
    room_types: ['single', 'double'],
    amenities: ['wifi', 'power_backup', 'washing_machine'],
    food: { provided: true, veg: true, nonVeg: false, breakfast: true, lunch: false, dinner: true },
    contact: { email: 'hello@sunrise.com', phone: '9876543210' },
    rents: [
      { id: 1, room_type: 'single', monthly_rent: 15000, deposit: 30000, rating: 4.5 }
    ]
  }
];

const CustomSelect = ({ name, options, value: externalValue, onChange, placeholder = "Select...", required }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [internalValue, setInternalValue] = useState(externalValue !== undefined ? externalValue : (options.length > 0 ? options[0].value : ''));
  
  const currentVal = externalValue !== undefined ? externalValue : internalValue;
  const selectedOption = options.find(o => o.value === currentVal) || (options.length > 0 ? options[0] : null);

  const handleSelect = (val) => {
    if (externalValue === undefined) {
      setInternalValue(val);
    }
    if (onChange) {
      onChange({ target: { name, value: val } });
    }
    setIsOpen(false);
  };

  return (
    <div className="custom-select-container" style={{ position: 'relative' }}>
      <input type="hidden" name={name} value={currentVal} required={required} />
      <div 
        className="form-select" 
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setIsOpen(!isOpen)}
      >
        {selectedOption ? selectedOption.label : placeholder}
      </div>
      {isOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000 }} onClick={() => setIsOpen(false)} />
          <div 
            className="custom-select-dropdown" 
            style={{ 
              position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 1001, 
              maxHeight: '200px', overflowY: 'auto', background: 'var(--card-bg)', 
              border: '1px solid var(--border-color)', borderRadius: '0.5rem', boxShadow: 'var(--shadow-lg)'
            }}
          >
            {options.map(opt => (
              <div 
                key={opt.value} 
                className="custom-select-option"
                onClick={() => handleSelect(opt.value)}
                style={{
                  padding: '0.3rem 0.5rem', cursor: 'pointer',
                  fontWeight: currentVal === opt.value ? '600' : '400',
                  color: currentVal === opt.value ? 'var(--primary-accent)' : 'inherit',
                  transition: 'background-color 0.2s',
                  fontSize: '0.8rem'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-color)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                {opt.label}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function App() {
  const [pgs, setPgs] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [draftFilters, setDraftFilters] = useState({ pg_type: '', room_type: '' });
  const [appliedFilters, setAppliedFilters] = useState({ pg_type: '', room_type: '' });
  
  const [selectedPg, setSelectedPg] = useState(null);
  const [addingPgLocation, setAddingPgLocation] = useState(null);
  const [addingRentForPg, setAddingRentForPg] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchMarker, setSearchMarker] = useState(null);
  const [showTransit, setShowTransit] = useState(false);
  const [isAddingGmapsLink, setIsAddingGmapsLink] = useState(false);
  const [showSharePopup, setShowSharePopup] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const fetchPgs = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('pgs')
        .select('*, pg_rent(room_type, monthly_rent, rating)');
        
      if (error) throw error;
      setPgs(data);
    } catch (err) {
      console.error("Error fetching PGs:", err);
    }
  }, []);

  useEffect(() => {
    fetchPgs();
  }, [fetchPgs]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const pgId = urlParams.get('pg');
    if (pgId && pgs.length > 0) {
      const pg = pgs.find(p => p.id.toString() === pgId);
      if (pg) {
        handleMarkerClick(pg);
      }
    }
  }, [pgs]);

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries: MAP_LIBRARIES,
  });

  const [map, setMap] = useState(null);
  const mapRef = useRef(null);
  const mapOptions = useMemo(() => ({
    disableDefaultUI: true,
    zoomControl: true,
    gestureHandling: 'greedy',
    styles: [
      {
        featureType: "poi",
        stylers: [{ visibility: "off" }]
      },
      {
        featureType: "poi",
        elementType: "labels",
        stylers: [{ visibility: "off" }]
      },
      {
        featureType: "landscape.man_made",
        elementType: "geometry",
        stylers: [{ visibility: "off" }]
      },
      {
        featureType: "administrative",
        elementType: "labels",
        stylers: [{ visibility: "off" }]
      },
      {
        featureType: "transit.line",
        elementType: "geometry",
        stylers: [{ visibility: "on" }]
      },
      {
        featureType: "transit.station",
        elementType: "labels.icon",
        stylers: [{ visibility: "on" }]
      }
    ]
  }), []);

  const onLoad = useCallback(function callback(mapInstance) {
    setMap(mapInstance);
    mapRef.current = mapInstance;
  }, []);

  const onUnmount = useCallback(function callback(mapInstance) {
    setMap(null);
    mapRef.current = null;
  }, []);

  // --- New Places Autocomplete Implementation ---
  const [searchValue, setSearchValue] = useState("");
  const [suggestions, setSuggestions] = useState({ status: "", data: [] });
  const [sessionToken, setSessionToken] = useState(null);

  // Initialize session token
  useEffect(() => {
    const initSession = async () => {
      if (isLoaded && window.google) {
        const { AutocompleteSessionToken } = await google.maps.importLibrary("places");
        setSessionToken(new AutocompleteSessionToken());
      }
    };
    initSession();
  }, [isLoaded]);

  // Fetch suggestions using the NEW Places API (v3.55+)
  const fetchSuggestions = useCallback(async (input) => {
    if (!input || !isLoaded || !window.google || !sessionToken) {
      setSuggestions({ status: "", data: [] });
      return;
    }

    try {
      setIsSearching(true);
      // Use the modern importLibrary method to ensure we have the latest classes
      const { AutocompleteSuggestion } = await google.maps.importLibrary("places");
      
      const { suggestions: results } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input,
        sessionToken,
        locationRestriction: {
          north: 13.20,
          south: 12.75,
          east: 77.85,
          west: 77.35,
        },
        includedRegionCodes: ["in"],
      });

      setSuggestions({
        status: results.length > 0 ? "OK" : "ZERO_RESULTS",
        data: results.map(s => ({
          place_id: s.placePrediction.placeId,
          description: s.placePrediction.text.toString(),
          main_text: s.placePrediction.mainText.toString(),
          secondary_text: s.placePrediction.secondaryText?.toString() || ""
        }))
      });
    } catch (e) {
      console.error("New Autocomplete Error:", e);
      setSuggestions({ status: "ERROR", data: [] });
    } finally {
      setIsSearching(false);
    }
  }, [isLoaded, sessionToken]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchValue.length > 2) {
        fetchSuggestions(searchValue);
      } else {
        setSuggestions({ status: "", data: [] });
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchValue, fetchSuggestions]);

  const handleSelectPlace = async (description, placeId) => {
    setSearchValue(description);
    setSuggestions({ status: "", data: [] });
    setShowDropdown(false);
    
    try {
      // Refresh session token for the next sequence
      const { AutocompleteSessionToken, Place } = await google.maps.importLibrary("places");
      setSessionToken(new AutocompleteSessionToken());

      // Use the new Place class to get details
      const place = new Place({ id: placeId });
      await place.fetchFields({ fields: ["location", "displayName"] });
      
      const lat = place.location.lat();
      const lng = place.location.lng();
      
      setSearchMarker({ lat, lng });
      if (mapRef.current) {
        mapRef.current.panTo({ lat, lng });
        mapRef.current.setZoom(15);
      }
    } catch (e) {
      console.error("Geocoding Error:", e);
    }
  };

  const filteredPgs = pgs.filter(pg => {
    if (appliedFilters.pg_type) {
      const typeMatches = pg.pg_type && pg.pg_type.toLowerCase().trim() === appliedFilters.pg_type.toLowerCase().trim();
      if (!typeMatches) return false;
    }
    
    if (appliedFilters.room_type) {
      const rtLower = appliedFilters.room_type.toLowerCase().trim();
      
      const hasRentMatch = pg.pg_rent && pg.pg_rent.some(r => r.room_type && r.room_type.toLowerCase().trim() === rtLower);
      const hasLocalRentMatch = pg.rents && pg.rents.some(r => r.room_type && r.room_type.toLowerCase().trim() === rtLower);
      
      const hasAnyRentData = (pg.pg_rent && pg.pg_rent.length > 0) || (pg.rents && pg.rents.length > 0);
      let hasRoomTypeMatch = false;
      
      if (!hasAnyRentData) {
        hasRoomTypeMatch = pg.room_types && Array.isArray(pg.room_types) && pg.room_types.some(rt => rt && rt.toLowerCase().trim() === rtLower);
      }
      
      if (!hasRentMatch && !hasLocalRentMatch && !hasRoomTypeMatch) return false;
    }
    
    return true;
  });

  const handleMapClick = (latlng) => {
    // Only show add PG form if not clicking a marker
    setAddingPgLocation(latlng);
    setSelectedPg(null);
    setSearchMarker(null);
  };

  const hasActiveFilters = appliedFilters.pg_type !== '' || appliedFilters.room_type !== '';

  const handleMarkerClick = async (pg) => {
    setAddingPgLocation(null);
    try {
      const { data: pgData, error: pgError } = await supabase
        .from('pgs')
        .select('*')
        .eq('id', pg.id)
        .single();
        
      if (pgError) throw pgError;
      
      const { data: rentData, error: rentError } = await supabase
        .from('pg_rent')
        .select('*')
        .eq('pg_id', pg.id);
        
      if (rentError) throw rentError;
      
      setSelectedPg({ ...pgData, rents: rentData });
    } catch (err) {
      console.error("Error fetching PG details:", err);
      setSelectedPg(pg); // fallback to basic data
    }
  };

  return (
    <div className="app-container">
      {/* Header overlay with Search & Filter */}
      <div className="header-overlay glass">
        <div className="search-bar" style={{ position: 'relative' }}>
          <div style={{ position: 'relative', flexGrow: 1, display: 'flex', alignItems: 'center' }}>
            <Search size={20} className="text-secondary" color="var(--text-secondary)" />
            <input 
              type="text" 
              placeholder="Search places in Bangalore..." 
              className="search-input"
              value={searchValue}
              onChange={(e) => {
                setSearchValue(e.target.value);
                setShowDropdown(true);
              }}
              disabled={!isLoaded}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
              style={{ paddingRight: isSearching ? '2.5rem' : '0.75rem' }}
            />
            {isSearching && (
              <div style={{ position: 'absolute', right: '0.75rem' }}>
                <div className="spinner" style={{ width: '1rem', height: '1rem' }}></div>
              </div>
            )}
          </div>
          
          {showDropdown && suggestions.status === "OK" && (
            <div className="search-dropdown glass" style={{ position: 'absolute', top: 'calc(100% + 0.75rem)', left: 0, right: 0, background: 'var(--card-bg)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden', zIndex: 2000, border: '1px solid var(--border-color)' }}>
              {suggestions.data
                .filter(item => 
                  item.description.toLowerCase().includes('bangalore') || 
                  item.description.toLowerCase().includes('bengaluru')
                )
                .map(({ place_id, description }) => (
                <div 
                  key={place_id} 
                  style={{ padding: '0.75rem 1rem', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', textAlign: 'left' }}
                  onClick={() => handleSelectPlace(description, place_id)}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-color)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <strong style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>{description}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
        <button 
          className="icon-btn" 
          style={{ 
            backgroundColor: showTransit ? 'var(--secondary-accent)' : 'var(--card-bg)', 
            color: showTransit ? 'white' : 'var(--text-primary)', 
            borderColor: showTransit ? 'var(--secondary-accent)' : 'var(--border-color)' 
          }}
          onClick={() => setShowTransit(!showTransit)}
          title="Toggle Bangalore Metro Lines"
        >
          <Train size={20} />
        </button>
        <button 
          className="icon-btn" 
          style={{ 
            position: 'relative', 
            backgroundColor: hasActiveFilters ? 'var(--primary-accent)' : 'var(--card-bg)', 
            color: hasActiveFilters ? 'white' : 'var(--text-primary)', 
            borderColor: hasActiveFilters ? 'var(--primary-accent)' : 'var(--border-color)' 
          }}
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter size={20} />
          {hasActiveFilters && (
            <span style={{ position: 'absolute', top: -2, right: -2, width: 12, height: 12, backgroundColor: '#ef4444', borderRadius: '50%', border: '2px solid white' }}></span>
          )}
        </button>
      </div>

      {/* Active Filter Indicators */}
      {hasActiveFilters && (
        <div style={{ position: 'absolute', top: '6.25rem', left: '50%', transform: 'translateX(-50%)', zIndex: 999, display: 'flex', gap: '0.5rem', width: '90%', maxWidth: '650px', flexWrap: 'wrap' }}>
          {appliedFilters.pg_type && (
            <div className="badge glass" style={{ margin: 0, padding: '0.4rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', background: 'var(--card-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-full)' }} onClick={() => { setAppliedFilters({...appliedFilters, pg_type: ''}); setDraftFilters({...draftFilters, pg_type: ''}); }}>
              <span style={{ fontWeight: 400 }}>Type:</span> <strong style={{ textTransform: 'capitalize' }}>{appliedFilters.pg_type}</strong>
              <X size={14} style={{ marginLeft: '0.2rem', color: 'var(--text-secondary)' }} />
            </div>
          )}
          {appliedFilters.room_type && (
            <div className="badge glass" style={{ margin: 0, padding: '0.4rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', background: 'var(--card-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-full)' }} onClick={() => { setAppliedFilters({...appliedFilters, room_type: ''}); setDraftFilters({...draftFilters, room_type: ''}); }}>
              <span style={{ fontWeight: 400 }}>Room:</span> <strong style={{ textTransform: 'capitalize' }}>{appliedFilters.room_type}</strong>
              <X size={14} style={{ marginLeft: '0.2rem', color: 'var(--text-secondary)' }} />
            </div>
          )}
        </div>
      )}

      {/* Filter Panel */}
      {showFilters && (
        <div className="filters-panel glass" style={{ top: hasActiveFilters ? '8.75rem' : '6.25rem' }}>
          <button className="modal-close" onClick={() => setShowFilters(false)}>
            <X size={20} />
          </button>
          <h3 style={{marginBottom: '1rem'}}>Filters</h3>
          
          <div className="form-group">
            <label className="form-label">PG Type</label>
            <CustomSelect 
              name="pg_type"
              value={draftFilters.pg_type} 
              onChange={e => setDraftFilters({...draftFilters, pg_type: e.target.value})}
              options={[
                {value: '', label: 'All'},
                {value: 'gents', label: 'Gents'},
                {value: 'ladies', label: 'Ladies'},
                {value: 'coliving', label: 'Coliving'}
              ]}
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">Room Type</label>
            <CustomSelect 
              name="room_type"
              value={draftFilters.room_type} 
              onChange={e => setDraftFilters({...draftFilters, room_type: e.target.value})}
              options={[
                {value: '', label: 'All'},
                {value: 'single', label: 'Single'},
                {value: 'double', label: 'Double'},
                {value: 'triple', label: 'Triple'},
                {value: 'quadruple', label: 'Quadruple'},
                {value: 'studio', label: 'Studio'}
              ]}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
            <button 
              className="btn-primary" 
              style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', boxShadow: 'none' }}
              onClick={() => {
                setDraftFilters({ pg_type: '', room_type: '' });
                setAppliedFilters({ pg_type: '', room_type: '' });
                setShowFilters(false);
              }}
            >
              Reset
            </button>
            <button 
              className="btn-primary" 
              onClick={() => {
                setAppliedFilters(draftFilters);
                setShowFilters(false);
              }}
            >
              Filter
            </button>
          </div>
        </div>
      )}

      {/* Map */}
      <div className="map-container">
        {isLoaded ? (
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={defaultCenter}
            zoom={13}
            onLoad={onLoad}
            onUnmount={onUnmount}
            onClick={(e) => handleMapClick({ lat: e.latLng.lat(), lng: e.latLng.lng() })}
            options={mapOptions}
          >
            {/* PG Markers */}
            {filteredPgs.map(pg => {
              const iconData = getMarkerIcon(pg);
              return (
                <MarkerF
                  key={pg.id}
                  position={{ lat: pg.latitude, lng: pg.longitude }}
                  icon={{ 
                    url: iconData.url,
                    anchor: isLoaded && window.google ? new google.maps.Point(iconData.width / 2, iconData.height) : null
                  }}
                  onClick={() => handleMarkerClick(pg)}
                  optimized={false}
                  zIndex={1000}
                />
              );
            })}
            
            {/* Temporary Pin for adding PG */}
            {addingPgLocation && (
              <OverlayViewF
                position={addingPgLocation}
                mapPaneName={OverlayViewF.OVERLAY_MOUSE_TARGET}
              >
                <div style={{ transform: 'translate(-50%, -100%)' }}>
                  <MapPin size={32} color="#ef4444" fill="white" />
                </div>
              </OverlayViewF>
            )}

            {/* Search Result Marker */}
            {searchMarker && (
              <OverlayViewF
                position={searchMarker}
                mapPaneName={OverlayViewF.OVERLAY_MOUSE_TARGET}
              >
                <div style={{ transform: 'translate(-50%, -100%)' }}>
                  <div style={{ 
                    width: '16px', height: '16px', background: '#3b82f6', 
                    border: '3px solid white', borderRadius: '50%', 
                    boxShadow: '0 0 10px rgba(59, 130, 246, 0.8)' 
                  }} />
                </div>
              </OverlayViewF>
            )}

            {showTransit && <TransitLayer />}
          </GoogleMap>
        ) : (
          <div>Loading map...</div>
        )}
      </div>

      {/* PG Details Modal */}
      {selectedPg && !addingRentForPg && (
        <div className="modal-overlay" onClick={() => { setSelectedPg(null); setIsAddingGmapsLink(false); setShowSharePopup(false); }}>
          <div className="modal-content glass" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => { setSelectedPg(null); setIsAddingGmapsLink(false); setShowSharePopup(false); }}>
              <X size={24} />
            </button>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '0.5rem', position: 'relative' }}>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                <Home size={24} color="var(--primary-accent)" /> 
                {selectedPg.name}
              </h2>
              
              <div style={{ position: 'relative', marginRight: '3rem' }}>
                <button 
                  onClick={() => setShowSharePopup(!showSharePopup)}
                  style={{ background: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: '2rem', padding: '0.4rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary-accent)' }}
                >
                  <Share2 size={16} /> Share
                </button>

                {showSharePopup && (
                  <div className="glass" style={{ position: 'absolute', top: 'calc(100% + 0.5rem)', right: 0, width: '260px', zIndex: 100, padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-lg)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>Share this PG</span>
                      <X size={14} style={{ cursor: 'pointer' }} onClick={() => setShowSharePopup(false)} />
                    </div>
                    
                    <div style={{ background: 'rgba(0,0,0,0.05)', padding: '0.5rem', borderRadius: '0.4rem', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '1rem', wordBreak: 'break-all', border: '1px dashed var(--border-color)' }}>
                      {`${window.location.origin}${window.location.pathname}?pg=${selectedPg.id}`}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <button 
                        className="btn-primary" 
                        style={{ padding: '0.5rem', fontSize: '0.8rem', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                        onClick={(e) => {
                          const shareUrl = `${window.location.origin}${window.location.pathname}?pg=${selectedPg.id}`;
                          navigator.clipboard.writeText(shareUrl);
                          const btn = e.currentTarget;
                          const oldText = btn.innerHTML;
                          btn.innerHTML = 'Copied!';
                          setTimeout(() => btn.innerHTML = oldText, 2000);
                        }}
                      >
                        Copy Link
                      </button>
                      <button 
                        className="btn-primary" 
                        style={{ padding: '0.5rem', fontSize: '0.8rem', width: '100%', background: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                        onClick={() => {
                          const shareUrl = `${window.location.origin}${window.location.pathname}?pg=${selectedPg.id}`;
                          const text = `Hey! Check out this PG I found on Bengaluru PG Rent: ${selectedPg.name}\n\nLocation & Details: ${shareUrl}`;
                          window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                        }}
                      >
                        Share on WhatsApp
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <MapPin size={18} /> {selectedPg.address}
            </p>
            {selectedPg.google_maps_link ? (
              <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '-0.5rem' }}>
                <MapPin size={18} color="var(--primary-accent)" /> 
                <a href={selectedPg.google_maps_link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary-accent)', fontSize: '0.85rem', fontWeight: 500 }}>View on Google Maps</a>
              </p>
            ) : (
              <div style={{ marginBottom: '1rem', position: 'relative' }}>
                <button 
                  onClick={() => setIsAddingGmapsLink(true)}
                  style={{ background: 'none', border: 'none', color: 'var(--primary-accent)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', padding: 0, fontWeight: 500 }}
                >
                  <Plus size={16} /> Add Google Maps location
                </button>

                {isAddingGmapsLink && (
                  <div className="glass" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, marginTop: '0.5rem', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-lg)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Update Location</span>
                      <X size={14} style={{ cursor: 'pointer' }} onClick={() => setIsAddingGmapsLink(false)} />
                    </div>                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', position: 'relative' }}>
                      <div style={{ position: 'relative', flexGrow: 1 }}>
                        <input 
                          id={`update_gmaps_${selectedPg.id}`}
                          autoFocus
                          className="form-input" 
                          placeholder="Paste Google Maps link..." 
                          style={{ fontSize: '0.8rem', padding: '0.5rem 0.75rem', height: 'auto', width: '100%', minWidth: 0, paddingRight: isResolving ? '2.5rem' : '0.75rem' }}
                          onChange={async (e) => {
                            const link = e.target.value.trim();
                            if (!link || isResolving) return;
                            
                            if (link.includes('maps.app.goo.gl') || link.includes('goo.gl/maps') || link.includes('google.com/maps')) {
                              setIsResolving(true);
                              try {
                                const { data, error: funcError } = await supabase.functions.invoke('resolve-google-maps', {
                                  body: { url: link }
                                });
                                if (data && !funcError) {
                                  const { lat, lng } = data;
                                  if (mapRef.current) {
                                    mapRef.current.panTo({ lat, lng });
                                    mapRef.current.setZoom(17);
                                  }
                                }
                              } catch (err) {
                                console.error("Auto-resolve error:", err);
                              } finally {
                                setIsResolving(false);
                              }
                            }
                          }}
                        />
                        {isResolving && (
                          <div style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)' }}>
                            <div className="spinner" style={{ width: '0.8rem', height: '0.8rem' }}></div>
                          </div>
                        )}
                      </div>
                      <button 
                        className="btn-primary" 
                        disabled={isResolving}
                        style={{ padding: '0.5rem 1.25rem', fontSize: '0.8rem', minWidth: '80px', width: 'auto', opacity: isResolving ? 0.7 : 1 }}
                        onClick={async (e) => {
                          const input = document.getElementById(`update_gmaps_${selectedPg.id}`);
                          const link = input.value.trim();
                          if (!link || isResolving) return;
                          
                          setIsResolving(true);
                          
                          try {
                            let lat = selectedPg.latitude;
                            let lng = selectedPg.longitude;

                            if (link.includes('maps.app.goo.gl') || link.includes('goo.gl/maps') || link.includes('google.com/maps')) {
                              const { data, error: funcError } = await supabase.functions.invoke('resolve-google-maps', {
                                body: { url: link }
                              });
                              if (data && !funcError) {
                                lat = data.lat;
                                lng = data.lng;
                              } else {
                                if (funcError) console.error("Resolution error:", funcError);
                                const localMatch = link.match(/!3d(-?\d+\.\d+)/) || link.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || link.match(/q=(-?\d+\.\d+),(-?\d+\.\d+)/);
                                if (localMatch) {
                                  const latMatch = link.match(/!3d(-?\d+\.\d+)/);
                                  const lngMatch = link.match(/!4d(-?\d+\.\d+)/);
                                  if (latMatch && lngMatch) {
                                    lat = parseFloat(latMatch[1]);
                                    lng = parseFloat(lngMatch[2]);
                                  } else {
                                    lat = parseFloat(localMatch[1]);
                                    lng = parseFloat(localMatch[2]);
                                  }
                                } else if (funcError) {
                                  alert("Could not resolve this Google Maps link. The marker will remain at its current position.");
                                }
                              }
                            }
                              

                            const { error } = await supabase
                              .from('pgs')
                              .update({ google_maps_link: link, latitude: lat, longitude: lng })
                              .eq('id', selectedPg.id);

                            if (error) throw error;
                            
                            const updatedPgs = pgs.map(p => p.id === selectedPg.id ? { ...p, google_maps_link: link, latitude: lat, longitude: lng } : p);
                            setPgs(updatedPgs);
                            setSelectedPg({ ...selectedPg, google_maps_link: link, latitude: lat, longitude: lng });
                            setIsAddingGmapsLink(false);
                          } catch (err) {
                            console.error("Error updating link:", err);
                            alert("Failed to update link. Please try again.");
                          } finally {
                            setIsResolving(false);
                          }
                        }}
                      >
                        {isResolving ? '...' : 'Save'}
                      </button>
                    </div>

                  </div>
                )}
              </div>
            )}
            
            <div style={{ margin: '1rem 0' }}>
              <span className="badge">{selectedPg.pg_type}</span>
              {selectedPg.room_types && selectedPg.room_types.map(rt => <span key={rt} className="badge" style={{background: 'rgba(16, 185, 129, 0.1)', color: 'var(--secondary-accent)'}}>{rt}</span>)}
            </div>

            {selectedPg.amenities && selectedPg.amenities.length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Amenities</h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {selectedPg.amenities.map(am => (
                    <span key={am} className="badge glass" style={{ background: 'white', color: 'var(--text-primary)', border: '1px solid var(--border-color)', margin: 0, padding: '0.2rem 0.6rem', fontSize: '0.75rem', textTransform: 'capitalize' }}>
                      {am.replace('_', ' ')}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {selectedPg.food && selectedPg.food.provided && (
              <div style={{ marginTop: '1rem' }}>
                <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Food Services</h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {selectedPg.food.veg && <span className="badge glass" style={{ background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', margin: 0, padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}>Veg</span>}
                  {selectedPg.food.nonVeg && <span className="badge glass" style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', margin: 0, padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}>Non-Veg</span>}
                  {selectedPg.food.breakfast && <span className="badge glass" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', margin: 0, padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}>Breakfast</span>}
                  {selectedPg.food.lunch && <span className="badge glass" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', margin: 0, padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}>Lunch</span>}
                  {selectedPg.food.dinner && <span className="badge glass" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', margin: 0, padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}>Dinner</span>}
                </div>
              </div>
            )}

            {selectedPg.contact && (selectedPg.contact.phone || selectedPg.contact.email) && (
              <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#f8fafc', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Contact</h4>
                {selectedPg.contact.phone && <div style={{ fontSize: '0.9rem', marginBottom: '0.25rem' }}><strong style={{color: 'var(--text-primary)'}}>Phone:</strong> {selectedPg.contact.phone}</div>}
                {selectedPg.contact.email && <div style={{ fontSize: '0.9rem' }}><strong style={{color: 'var(--text-primary)'}}>Email:</strong> {selectedPg.contact.email}</div>}
              </div>
            )}
            
            <div style={{ marginTop: '1.5rem' }}>
              <h3>Rent Details</h3>
              {selectedPg.rents && selectedPg.rents.length > 0 ? (
                selectedPg.rents.map(r => (
                  <div key={r.id} style={{ padding: '1rem', background: 'var(--card-bg)', borderRadius: 'var(--radius-md)', marginBottom: '0.75rem', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <strong style={{ fontSize: '1.1rem', textTransform: 'capitalize' }}>{r.room_type}</strong>
                      <span style={{ display: 'flex', alignItems: 'center', color: 'var(--secondary-accent)', fontWeight: 600, fontSize: '1.1rem' }}><IndianRupee size={16}/> {r.monthly_rent}/mo</span>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                      <div><strong style={{color: 'var(--text-primary)'}}>Deposit:</strong> ₹{r.deposit}</div>
                      <div><strong style={{color: 'var(--text-primary)'}}>Refundable:</strong> ₹{r.refundable_deposit || 0}</div>
                      <div><strong style={{color: 'var(--text-primary)'}}>Notice:</strong> {r.notice_period_days || 0} days</div>
                      <div style={{ display: 'flex', alignItems: 'center' }}><strong style={{color: 'var(--text-primary)', marginRight: '0.25rem'}}>Rating:</strong> <Star size={14} color="#fbbf24" style={{marginRight:'0.15rem'}}/> {r.rating}</div>
                    </div>
                    
                    {r.comment && (
                      <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-color)', fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                        "{r.comment}"
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p>No rent details available.</p>
              )}
              
              <button className="btn-primary" onClick={() => setAddingRentForPg(selectedPg)}>
                Add Rent Info
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add PG Form Modal */}
      {addingPgLocation && (
        <div className="modal-overlay" onClick={() => setAddingPgLocation(null)}>
          <div className="modal-content glass" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setAddingPgLocation(null)}>
              <X size={24} />
            </button>
            <h2>Register New PG</h2>
            <p>At selected map location</p>
            
            <form onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.target);
              const gMapsLink = formData.get('google_maps_link');
              
              let lat = addingPgLocation.lat;
              let lng = addingPgLocation.lng;

              if (gMapsLink && (gMapsLink.includes('maps.app.goo.gl') || gMapsLink.includes('goo.gl/maps') || gMapsLink.includes('google.com/maps'))) {
                setIsResolving(true);
                try {
                  const { data, error: funcError } = await supabase.functions.invoke('resolve-google-maps', {
                    body: { url: gMapsLink }
                  });
                  if (data && !funcError) {
                    lat = data.lat;
                    lng = data.lng;
                  } else {
                    // Fallback to local regex if edge function fails
                    const coordsMatch = gMapsLink.match(/!3d(-?\d+\.\d+)/) || gMapsLink.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
                    if (coordsMatch) {
                      lat = parseFloat(coordsMatch[1]);
                      lng = parseFloat(coordsMatch[2]);
                    }
                  }
                } catch (err) {
                  console.error("Error resolving maps link:", err);
                } finally {
                  setIsResolving(false);
                }
              }

              const dbPg = {
                name: formData.get('name'),
                address: formData.get('address'),
                google_maps_link: gMapsLink,
                latitude: lat,
                longitude: lng,
                pg_type: formData.get('pg_type'),
                room_types: formData.getAll('room_types'),
                amenities: formData.getAll('amenities'),
                food: {
                  provided: formData.get('food_provided') === 'on',
                  veg: formData.get('food_veg') === 'on',
                  nonVeg: formData.get('food_nonVeg') === 'on',
                  breakfast: formData.get('food_breakfast') === 'on',
                  lunch: formData.get('food_lunch') === 'on',
                  dinner: formData.get('food_dinner') === 'on'
                },
                contact: {
                  phone: formData.get('contact_phone'),
                  email: formData.get('contact_email')
                }
              };
              
              try {
                const { data, error } = await supabase
                  .from('pgs')
                  .insert([dbPg])
                  .select();
                  
                if (error) throw error;
                const savedPg = { ...data[0], rents: [] };
                setPgs([...pgs, savedPg]);
                setAddingPgLocation(null);
              } catch (err) {
                console.error("Error creating PG:", err);
                alert("Failed to register PG. Please try again.");
              }
            }}>
              <div className="form-group">
                <label className="form-label">PG Name</label>
                <input required name="name" className="form-input" placeholder="e.g. Skyline PG" />
              </div>
              <div className="form-group">
                <label className="form-label">Address</label>
                <input required name="address" className="form-input" placeholder="Full address" />
              </div>
              <div className="form-group">
                <label className="form-label">Google Maps Link</label>
                <div style={{ position: 'relative' }}>
                  <input 
                    name="google_maps_link" 
                    className="form-input" 
                    placeholder="Paste link to resolve location..." 
                    style={{ paddingRight: isResolving ? '2.5rem' : '0.5rem' }}
                    onChange={async (e) => {
                      const link = e.target.value.trim();
                      if (!link || isResolving) return;
                      
                      if (link.includes('maps.app.goo.gl') || link.includes('goo.gl/maps') || link.includes('google.com/maps')) {
                        setIsResolving(true);
                        try {
                          const { data, error: funcError } = await supabase.functions.invoke('resolve-google-maps', {
                            body: { url: link }
                          });
                          if (data && !funcError) {
                            const { lat, lng } = data;
                            setAddingPgLocation({ lat, lng });
                            if (mapRef.current) {
                              mapRef.current.panTo({ lat, lng });
                              mapRef.current.setZoom(17);
                            }
                          }
                        } catch (err) {
                          console.error("Auto-resolve error:", err);
                        } finally {
                          setIsResolving(false);
                        }
                      }
                    }}
                  />
                  {isResolving && (
                    <div style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)' }}>
                      <div className="spinner" style={{ width: '0.8rem', height: '0.8rem' }}></div>
                    </div>
                  )}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.25rem', fontWeight: 500 }}>
                  Current Pin: {addingPgLocation.lat.toFixed(6)}, {addingPgLocation.lng.toFixed(6)}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">PG Type</label>
                <CustomSelect 
                  name="pg_type" required
                  options={[
                    {value: 'gents', label: 'Gents'},
                    {value: 'ladies', label: 'Ladies'},
                    {value: 'coliving', label: 'Coliving'}
                  ]}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Available Room Types</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {['single', 'double', 'triple', 'quadruple', 'studio'].map(rt => (
                    <label key={rt} className="badge glass" style={{ cursor: 'pointer', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}>
                      <input type="checkbox" name="room_types" value={rt} />
                      <span style={{ textTransform: 'capitalize' }}>{rt}</span>
                    </label>
                  ))}
                </div>
              </div>
              
              <div className="form-group">
                <label className="form-label">Amenities</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {['wifi', 'ac', 'tv', 'washing_machine', 'power_backup', 'lift', 'gym', 'cctv', 'housekeeping', 'parking'].map(am => (
                    <label key={am} className="badge glass" style={{ cursor: 'pointer', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}>
                      <input type="checkbox" name="amenities" value={am} />
                      <span style={{ textTransform: 'capitalize' }}>{am.replace('_', ' ')}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Food Services</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {['provided', 'veg', 'nonVeg', 'breakfast', 'lunch', 'dinner'].map(f => (
                    <label key={f} className="badge glass" style={{ cursor: 'pointer', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}>
                      <input type="checkbox" name={`food_${f}`} />
                      <span style={{ textTransform: 'capitalize' }}>{f}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label className="form-label">Phone</label>
                  <input name="contact_phone" type="tel" className="form-input" placeholder="Phone number" />
                </div>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label className="form-label">Email</label>
                  <input name="contact_email" type="email" className="form-input" placeholder="Email address" />
                </div>
              </div>
              
              <button type="submit" className="btn-primary">Register PG</button>
            </form>
          </div>
        </div>
      )}

      {/* Add Rent Form Modal */}
      {addingRentForPg && (
        <div className="modal-overlay" onClick={() => setAddingRentForPg(null)}>
          <div className="modal-content glass" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setAddingRentForPg(null)}>
              <X size={24} />
            </button>
            <h2>Add Rent Information</h2>
            <p>For {addingRentForPg.name}</p>
            
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.target);
              const newRent = {
                pg_id: addingRentForPg.id,
                room_type: formData.get('room_type'),
                monthly_rent: parseInt(formData.get('monthly_rent')),
                deposit: parseInt(formData.get('deposit')),
                refundable_deposit: parseInt(formData.get('refundable_deposit')) || 0,
                notice_period_days: parseInt(formData.get('notice_period_days')) || 0,
                rating: parseFloat(formData.get('rating')),
                comment: formData.get('comment') || '',
              };
              
              const insertRent = async () => {
                try {
                  const { data, error } = await supabase
                    .from('pg_rent')
                    .insert([newRent])
                    .select();
                    
                  if (error) throw error;
                  const savedRent = data[0];
                  
                  const updatedPgs = pgs.map(pg => {
                    if (pg.id === addingRentForPg.id) {
                      return { ...pg, rents: [...(pg.rents || []), savedRent] };
                    }
                    return pg;
                  });
                  
                  setPgs(updatedPgs);
                  if (selectedPg && selectedPg.id === addingRentForPg.id) {
                    setSelectedPg({
                      ...selectedPg,
                      rents: [...(selectedPg.rents || []), savedRent]
                    });
                  }
                  setAddingRentForPg(null);
                } catch (err) {
                  console.error("Error creating rent:", err);
                }
              };
              insertRent();
            }}>
              <div className="form-group">
                <label className="form-label">Room Type</label>
                <CustomSelect 
                  name="room_type" required
                  options={[
                    {value: 'single', label: 'Single'},
                    {value: 'double', label: 'Double'},
                    {value: 'triple', label: 'Triple'},
                    {value: 'quadruple', label: 'Quadruple'},
                    {value: 'studio', label: 'Studio'}
                  ]}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Monthly Rent (₹)</label>
                <input required type="number" name="monthly_rent" className="form-input" placeholder="e.g. 15000" />
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Deposit (₹)</label>
                  <input required type="number" name="deposit" className="form-input" placeholder="e.g. 30000" />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Refundable (₹)</label>
                  <input type="number" name="refundable_deposit" className="form-input" placeholder="e.g. 20000" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Notice Period (Days)</label>
                  <input type="number" name="notice_period_days" className="form-input" placeholder="e.g. 30" />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Rating (out of 5)</label>
                  <input required type="number" step="0.1" min="1" max="5" name="rating" className="form-input" placeholder="e.g. 4.5" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Comments / Notes</label>
                <input type="text" name="comment" className="form-input" placeholder="e.g. Fully furnished, east facing" />
              </div>
              
              <button type="submit" className="btn-primary">Save Rent Info</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

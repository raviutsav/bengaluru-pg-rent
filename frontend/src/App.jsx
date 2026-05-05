import { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { Search, Filter, X, Plus, Home, MapPin, IndianRupee, Star } from 'lucide-react';
import L from 'leaflet';
import Fuse from 'fuse.js';
import { createClient } from '@supabase/supabase-js';
import './index.css';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Fix for default marker icons in Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const defaultCenter = [12.9716, 77.5946]; // Bangalore

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

function MapInteraction({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng);
    },
  });
  return null;
}

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
              maxHeight: '200px', overflowY: 'auto', background: '#fff', 
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
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
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
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [draftFilters, setDraftFilters] = useState({ pg_type: '', room_type: '' });
  const [appliedFilters, setAppliedFilters] = useState({ pg_type: '', room_type: '' });
  
  const [selectedPg, setSelectedPg] = useState(null);
  const [addingPgLocation, setAddingPgLocation] = useState(null);
  const [addingRentForPg, setAddingRentForPg] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    const fetchPgs = async () => {
      try {
        const { data, error } = await supabase
          .from('pgs')
          .select('*, pg_rent(room_type, monthly_rent, rating)');
          
        if (error) throw error;
        setPgs(data);
      } catch (err) {
        console.error("Error fetching PGs:", err);
      }
    };
    fetchPgs();
  }, []);

  const fuse = useMemo(() => {
    return new Fuse(pgs, {
      keys: ['name', 'address'],
      threshold: 0.4,
    });
  }, [pgs]);

  const searchResults = useMemo(() => {
    if (!searchQuery) return pgs;
    return fuse.search(searchQuery).map(result => result.item);
  }, [searchQuery, pgs, fuse]);

  const filteredPgs = searchResults.filter(pg => {
    if (appliedFilters.pg_type) {
      const typeMatches = pg.pg_type && pg.pg_type.toLowerCase().trim() === appliedFilters.pg_type.toLowerCase().trim();
      if (!typeMatches) return false;
    }
    
    if (appliedFilters.room_type) {
      const rtLower = appliedFilters.room_type.toLowerCase().trim();
      
      const hasRentMatch = pg.pg_rent && pg.pg_rent.some(r => r.room_type && r.room_type.toLowerCase().trim() === rtLower);
      const hasLocalRentMatch = pg.rents && pg.rents.some(r => r.room_type && r.room_type.toLowerCase().trim() === rtLower);
      
      // If the PG has no rent data entered yet, fall back to checking its general room_types array
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

  const getMarkerIcon = (pg) => {
    const backendRents = pg.pg_rent || [];
    const localRents = pg.rents || [];
    const activeRents = [...backendRents, ...localRents];
    
    let htmlContent = `<div class="price-marker-multi" style="background-color: #64748b; --marker-bg: #64748b;">
        <div class="price-row" style="justify-content: center;">
          <span>NA</span>
        </div>
      </div>`;
    let iconHeight = 34;
    
    if (activeRents.length > 0) {
      // Calculate overall average rating
      const ratings = activeRents.map(r => r.rating).filter(r => r != null);
      let avgRating = 0;
      if (ratings.length > 0) {
        avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
      }
      
      // Map rating to color (red to green spectrum)
      let markerColor = '#64748b'; // default slate gray for NA rating
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
      
      const rows = Object.entries(rentByRoom).map(([type, data]) => {
        const avgRent = Math.round(data.sum / data.count);
        const label = typeMapping[type] || type.charAt(0).toUpperCase();
        return `<div class="price-row">
                  <span class="room-type-num">${label}</span>
                  <span>₹${(avgRent/1000).toFixed(1)}k</span>
                </div>`;
      }).join('');
      
      htmlContent = `<div class="price-marker-multi" style="background-color: ${markerColor}; --marker-bg: ${markerColor};">
        ${rows}
      </div>`;
      
      iconHeight = 10 + Object.keys(rentByRoom).length * 24;
    }

    return L.divIcon({
      className: 'custom-price-icon',
      html: htmlContent,
      iconSize: [80, iconHeight],
      iconAnchor: [40, iconHeight + 5]
    });
  };

  return (
    <div className="app-container">
      {/* Header overlay with Search & Filter */}
      <div className="header-overlay glass">
        <div className="search-bar" style={{ position: 'relative' }}>
          <Search size={20} className="text-secondary" color="var(--text-secondary)" />
          <input 
            type="text" 
            placeholder="Search PGs in Bangalore..." 
            className="search-input"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          />
          
          {showDropdown && searchQuery && (
            <div className="search-dropdown glass" style={{ position: 'absolute', top: 'calc(100% + 0.75rem)', left: 0, right: 0, background: 'white', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden', zIndex: 2000, border: '1px solid var(--border-color)' }}>
              {searchResults.slice(0, 5).map(pg => (
                <div 
                  key={pg.id} 
                  style={{ padding: '0.75rem 1rem', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', textAlign: 'left' }}
                  onClick={() => {
                    setSearchQuery(pg.name);
                    setShowDropdown(false);
                    handleMarkerClick(pg);
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <strong style={{ color: 'var(--text-primary)', fontSize: '0.9rem', marginBottom: '0.2rem' }}>{pg.name}</strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pg.address}</span>
                </div>
              ))}
              {searchResults.length === 0 && (
                <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No matches found</div>
              )}
            </div>
          )}
        </div>
        <button 
          className="icon-btn" 
          style={{ 
            position: 'relative', 
            backgroundColor: hasActiveFilters ? 'var(--primary-accent)' : 'white', 
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
            <div className="badge glass" style={{ margin: 0, padding: '0.4rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', background: 'white', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-full)' }} onClick={() => { setAppliedFilters({...appliedFilters, pg_type: ''}); setDraftFilters({...draftFilters, pg_type: ''}); }}>
              <span style={{ fontWeight: 400 }}>Type:</span> <strong style={{ textTransform: 'capitalize' }}>{appliedFilters.pg_type}</strong>
              <X size={14} style={{ marginLeft: '0.2rem', color: 'var(--text-secondary)' }} />
            </div>
          )}
          {appliedFilters.room_type && (
            <div className="badge glass" style={{ margin: 0, padding: '0.4rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', background: 'white', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-full)' }} onClick={() => { setAppliedFilters({...appliedFilters, room_type: ''}); setDraftFilters({...draftFilters, room_type: ''}); }}>
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
        <MapContainer center={defaultCenter} zoom={13} style={{ height: '100%', width: '100%' }} zoomControl={false}>
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />
          <MapInteraction onMapClick={handleMapClick} />
          
          <MarkerClusterGroup
            chunkedLoading
            maxClusterRadius={45}
            disableClusteringAtZoom={16}
            spiderfyOnMaxZoom={true}
            showCoverageOnHover={false}
            iconCreateFunction={(cluster) => {
              const count = cluster.getChildCount();
              return L.divIcon({
                html: `<div class="cluster-marker"><span>${count} PGs</span></div>`,
                className: 'custom-cluster-icon',
                iconSize: [80, 40]
              });
            }}
          >
            {filteredPgs.map(pg => (
              <Marker 
                key={pg.id} 
                position={[pg.latitude, pg.longitude]}
                icon={getMarkerIcon(pg)}
                eventHandlers={{
                  click: () => handleMarkerClick(pg)
                }}
              >
              </Marker>
            ))}
          </MarkerClusterGroup>
        </MapContainer>
      </div>

      {/* PG Details Modal */}
      {selectedPg && !addingRentForPg && (
        <div className="modal-overlay" onClick={() => setSelectedPg(null)}>
          <div className="modal-content glass" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedPg(null)}>
              <X size={24} />
            </button>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Home size={24} color="var(--primary-accent)" /> 
              {selectedPg.name}
            </h2>
            <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <MapPin size={18} /> {selectedPg.address}
            </p>
            
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
            
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.target);
              const dbPg = {
                name: formData.get('name'),
                address: formData.get('address'),
                latitude: addingPgLocation.lat,
                longitude: addingPgLocation.lng,
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
              
              const insertPg = async () => {
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
                }
              };
              insertPg();
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
                  <input required name="contact_phone" type="tel" className="form-input" placeholder="Phone number" />
                </div>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label className="form-label">Email</label>
                  <input required name="contact_email" type="email" className="form-input" placeholder="Email address" />
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

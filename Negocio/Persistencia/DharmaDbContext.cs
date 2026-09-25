using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Negocio.Persistencia.Modelos;

namespace Negocio.Persistencia
{
    public class DharmaDbContext : DbContext
    {
        private readonly ILogger<DharmaDbContext> _logger;

        public DharmaDbContext(DbContextOptions<DharmaDbContext> options, ILogger<DharmaDbContext> logger) : base(options)
        {
            _logger = logger;
        }

        protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder) { }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            #region MAPEO_TABLAS

            // TABLA PACIENTES
            modelBuilder.Entity<Paciente>().HasKey(e => e.IdPaciente);
            modelBuilder.Entity<Paciente>().Property(e => e.IdPaciente);
            modelBuilder.Entity<Paciente>().Property(e => e.NumeroHistoriaClinica);
            modelBuilder.Entity<Paciente>().Property(e => e.DNI);
            modelBuilder.Entity<Paciente>().Property(e => e.Nombre);
            modelBuilder.Entity<Paciente>().Property(e => e.Apellidos);
            modelBuilder.Entity<Paciente>().Property(e => e.FechaNacimiento);
            modelBuilder.Entity<Paciente>().Property(e => e.Sexo);
            modelBuilder.Entity<Paciente>().Property(e => e.Telefono);
            modelBuilder.Entity<Paciente>().Property(e => e.Email);
            modelBuilder.Entity<Paciente>().Property(e => e.Direccion);
            modelBuilder.Entity<Paciente>().Property(e => e.CodigoPostal);
            modelBuilder.Entity<Paciente>().Property(e => e.Ciudad);
            modelBuilder.Entity<Paciente>().Property(e => e.Observaciones);
            modelBuilder.Entity<Paciente>().Property(e => e.FechaAlta);
            modelBuilder.Entity<Paciente>().Property(e => e.FechaModificacion);
            modelBuilder.Entity<Paciente>().Property(e => e.Activo);

            // TABLA RADIOGRAFIAS
            modelBuilder.Entity<Radiografia>().HasKey(e => e.IdRadiografia);
            modelBuilder.Entity<Radiografia>().Property(e => e.IdRadiografia);
            modelBuilder.Entity<Radiografia>().Property(e => e.IdPaciente);
            modelBuilder.Entity<Radiografia>().Property(e => e.NombreEstudio);
            modelBuilder.Entity<Radiografia>().Property(e => e.TipoRadiografia);
            modelBuilder.Entity<Radiografia>().Property(e => e.ZonaAnatomica);
            modelBuilder.Entity<Radiografia>().Property(e => e.StudyInstanceUID);
            modelBuilder.Entity<Radiografia>().Property(e => e.SeriesInstanceUID);
            modelBuilder.Entity<Radiografia>().Property(e => e.SOPInstanceUID);
            modelBuilder.Entity<Radiografia>().Property(e => e.StudyDate);
            modelBuilder.Entity<Radiografia>().Property(e => e.NombreArchivo);
            modelBuilder.Entity<Radiografia>().Property(e => e.TamanoBytes);
            modelBuilder.Entity<Radiografia>().Property(e => e.DICOM);
            modelBuilder.Entity<Radiografia>().Property(e => e.FechaCarga);

            #endregion
        }

        #region COLECCIONES DE ENTIDADES

        public virtual DbSet<Paciente> Pacientes { get; set; }
        public virtual DbSet<Radiografia> Radiografias { get; set; }

        #endregion
    }
}

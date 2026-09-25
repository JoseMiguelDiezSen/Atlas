using Negocio.Persistencia.Modelos;

namespace Negocio.Servicios
{
    public interface IGestionVisor
    {
        /// <summary>
        /// Obtiene la lista de pacientes
        /// </summary>
        /// <returns> Lista de pacientes </returns>
        List<Paciente> GetPacientes();

        /// <summary>
        /// Obtiene los datos de un paciente específico, incluyendo sus radiografías
        /// </summary>
        /// <param name="idPaciente"> Id del paciente </param>
        /// <returns> Datos del paciente o null si no se encuentra </returns>
        Paciente? GetDatosPaciente(long idPaciente);
    }
}
